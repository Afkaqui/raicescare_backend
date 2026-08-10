import {
  BadRequestException,
  Injectable,
  Logger,
  NotFoundException,
} from "@nestjs/common";
import { ConfigService } from "@nestjs/config";
import { createHash, randomBytes } from "node:crypto";
import { createReadStream } from "node:fs";
import { mkdir, stat, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { PrismaService } from "../../prisma/prisma.service";

/**
 * Solo imágenes, y comprobadas por sus bytes iniciales. Fiarse del
 * `content-type` que declara el navegador permitiría subir cualquier cosa
 * renombrada.
 */
const FIRMAS: { mime: string; extension: string; prueba: (b: Buffer) => boolean }[] = [
  {
    mime: "image/png",
    extension: ".png",
    prueba: (b) => b.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10])),
  },
  {
    mime: "image/jpeg",
    extension: ".jpg",
    prueba: (b) => b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff,
  },
  {
    mime: "image/webp",
    extension: ".webp",
    prueba: (b) =>
      b.subarray(0, 4).toString("ascii") === "RIFF" &&
      b.subarray(8, 12).toString("ascii") === "WEBP",
  },
];

const TAMANO_MAXIMO = 6 * 1024 * 1024;

@Injectable()
export class MediaService {
  private readonly logger = new Logger(MediaService.name);

  constructor(
    private readonly prisma: PrismaService,
    private readonly config: ConfigService,
  ) {}

  private get carpeta(): string {
    return this.config.get<string>("ALMACEN_RUTA") ?? "/app/almacen";
  }

  async guardar(
    archivo: { buffer: Buffer; originalname: string; size: number },
    datos: { altText?: string },
    usuarioId: string,
  ) {
    if (!archivo?.buffer?.length) {
      throw new BadRequestException("No llegó ningún archivo");
    }

    if (archivo.size > TAMANO_MAXIMO) {
      throw new BadRequestException(
        `La imagen supera los ${Math.round(TAMANO_MAXIMO / 1024 / 1024)} MB`,
      );
    }

    const firma = FIRMAS.find((candidata) => candidata.prueba(archivo.buffer));
    if (!firma) {
      throw new BadRequestException(
        "Formato no admitido. Se aceptan PNG, JPG y WebP.",
      );
    }

    const dimensiones = this.medir(archivo.buffer, firma.mime);
    const checksum = createHash("sha256").update(archivo.buffer).digest("hex");

    // El mismo archivo subido dos veces no se duplica en disco.
    const existente = await this.prisma.mediaAsset.findFirst({
      where: { checksumSha256: checksum },
    });
    if (existente) return this.publico(existente);

    // Nombre aleatorio: el original puede traer rutas, acentos o algo peor.
    const clave = `${randomBytes(16).toString("hex")}${firma.extension}`;

    await mkdir(this.carpeta, { recursive: true });
    await writeFile(join(this.carpeta, clave), archivo.buffer);

    const registro = await this.prisma.mediaAsset.create({
      data: {
        storageKey: clave,
        originalName: archivo.originalname.slice(0, 300),
        mimeType: firma.mime,
        sizeBytes: archivo.size,
        width: dimensiones?.ancho,
        height: dimensiones?.alto,
        altText: datos.altText?.slice(0, 300),
        checksumSha256: checksum,
        uploadedById: usuarioId,
      },
    });

    this.logger.log(`Imagen ${clave} subida (${archivo.size} bytes)`);
    return this.publico(registro);
  }

  async listar() {
    const archivos = await this.prisma.mediaAsset.findMany({
      orderBy: { createdAt: "desc" },
      take: 100,
    });
    return archivos.map((archivo) => this.publico(archivo));
  }

  /** Devuelve el archivo para servirlo. La clave nunca compone rutas. */
  async abrir(clave: string) {
    // Sin esto, una clave como «../../.env» leería fuera del almacén.
    if (!/^[a-f0-9]{32}\.(png|jpg|webp)$/.test(clave)) {
      throw new NotFoundException("Archivo no encontrado");
    }

    const registro = await this.prisma.mediaAsset.findUnique({
      where: { storageKey: clave },
    });
    if (!registro) throw new NotFoundException("Archivo no encontrado");

    const ruta = resolve(this.carpeta, clave);
    if (!ruta.startsWith(resolve(this.carpeta))) {
      throw new NotFoundException("Archivo no encontrado");
    }

    try {
      await stat(ruta);
    } catch {
      throw new NotFoundException("Archivo no encontrado");
    }

    return { flujo: createReadStream(ruta), registro };
  }

  private publico(registro: {
    id: string;
    storageKey: string;
    originalName: string;
    mimeType: string;
    sizeBytes: number;
    width: number | null;
    height: number | null;
    altText: string | null;
  }) {
    return {
      id: registro.id,
      url: `/api/v1/media/${registro.storageKey}`,
      originalName: registro.originalName,
      mimeType: registro.mimeType,
      sizeBytes: registro.sizeBytes,
      width: registro.width,
      height: registro.height,
      altText: registro.altText,
    };
  }

  /**
   * Lee las dimensiones de la cabecera. Se hace a mano en vez de traer un
   * decodificador: son dos formatos con cabecera simple y evita una
   * dependencia que procesaría archivos que vienen de fuera.
   */
  private medir(b: Buffer, mime: string): { ancho: number; alto: number } | null {
    try {
      if (mime === "image/png") {
        // IHDR va justo después de la firma y su longitud.
        return { ancho: b.readUInt32BE(16), alto: b.readUInt32BE(20) };
      }

      if (mime === "image/webp" && b.subarray(12, 16).toString("ascii") === "VP8X") {
        return {
          ancho: 1 + b.readUIntLE(24, 3),
          alto: 1 + b.readUIntLE(27, 3),
        };
      }

      if (mime === "image/jpeg") {
        let i = 2;
        while (i < b.length - 9) {
          if (b[i] !== 0xff) {
            i += 1;
            continue;
          }
          const marcador = b[i + 1];
          // Los marcadores SOF llevan el tamaño; se saltan los variantes sin él.
          const esSof =
            marcador >= 0xc0 &&
            marcador <= 0xcf &&
            ![0xc4, 0xc8, 0xcc].includes(marcador);

          if (esSof) return { alto: b.readUInt16BE(i + 5), ancho: b.readUInt16BE(i + 7) };
          i += 2 + b.readUInt16BE(i + 2);
        }
      }
    } catch {
      // Una cabecera rara no debe impedir la subida: el tamaño es accesorio.
    }
    return null;
  }
}

/** Extensión permitida derivada del nombre, para mensajes de error claros. */
export function extensionDe(nombre: string): string {
  return extname(nombre).toLowerCase();
}
