import {
  ConflictException,
  Injectable,
  NotFoundException,
} from "@nestjs/common";
import { Prisma } from "@prisma/client";
import { PrismaService } from "../../prisma/prisma.service";
import { AuthService, type Actor } from "../auth/auth.service";
import type { ContenidoDto } from "./content.schema";

const CON_PORTADA = {
  portada: {
    select: {
      storageKey: true,
      altText: true,
      width: true,
      height: true,
    },
  },
} satisfies Prisma.ContentItemInclude;

@Injectable()
export class ContentService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly auth: AuthService,
  ) {}

  /** Listado público: solo lo publicado, y solo lo que el sitio necesita. */
  async publicos(kind?: string, programCode?: string) {
    const items = await this.prisma.contentItem.findMany({
      where: {
        status: "published",
        ...(kind ? { kind } : {}),
        ...(programCode ? { programCode } : {}),
      },
      include: CON_PORTADA,
      orderBy: [{ startsOn: "desc" }, { publishedAt: "desc" }],
    });

    return items.map((item) => this.vistaPublica(item));
  }

  async publicoPorSlug(kind: string, slug: string) {
    const item = await this.prisma.contentItem.findUnique({
      where: { kind_slug: { kind, slug } },
      include: CON_PORTADA,
    });

    // Un borrador responde igual que algo inexistente: su slug no debe
    // delatar que se está preparando algo.
    if (!item || item.status !== "published") {
      throw new NotFoundException("Contenido no encontrado");
    }

    return this.vistaPublica(item);
  }

  /** Listado del panel: incluye borradores. */
  listarAdmin(kind?: string) {
    return this.prisma.contentItem.findMany({
      where: kind ? { kind } : {},
      include: CON_PORTADA,
      orderBy: { updatedAt: "desc" },
    });
  }

  async detalleAdmin(id: string) {
    const item = await this.prisma.contentItem.findUnique({
      where: { id },
      include: CON_PORTADA,
    });
    if (!item) throw new NotFoundException(`No existe el contenido ${id}`);
    return item;
  }

  async crear(datos: ContenidoDto, actor: Actor, ip?: string) {
    await this.exigirSlugLibre(datos.kind, datos.slug);

    const item = await this.prisma.contentItem.create({
      data: {
        ...this.campos(datos),
        createdById: actor.id,
        updatedById: actor.id,
        publishedAt: datos.status === "published" ? new Date() : null,
      },
      include: CON_PORTADA,
    });

    await this.auth.auditar(actor.id, "contenido.creado", "content", item.id, ip, {
      kind: item.kind,
      slug: item.slug,
      status: item.status,
    });

    return item;
  }

  async actualizar(id: string, datos: ContenidoDto, actor: Actor, ip?: string) {
    const previo = await this.detalleAdmin(id);
    if (previo.kind !== datos.kind || previo.slug !== datos.slug) {
      await this.exigirSlugLibre(datos.kind, datos.slug, id);
    }

    const item = await this.prisma.contentItem.update({
      where: { id },
      data: {
        ...this.campos(datos),
        updatedById: actor.id,
        // La fecha de publicación se fija la primera vez y no se reescribe:
        // despublicar y volver a publicar no debería falsear la antigüedad.
        publishedAt:
          datos.status === "published"
            ? (previo.publishedAt ?? new Date())
            : previo.publishedAt,
      },
      include: CON_PORTADA,
    });

    if (previo.status !== item.status) {
      await this.auth.auditar(
        actor.id,
        item.status === "published" ? "contenido.publicado" : "contenido.despublicado",
        "content",
        id,
        ip,
        { slug: item.slug },
      );
    } else {
      await this.auth.auditar(actor.id, "contenido.editado", "content", id, ip, {
        slug: item.slug,
      });
    }

    return item;
  }

  /** Solo superadmin: borrar es irreversible, despublicar no. */
  async eliminar(id: string, actor: Actor, ip?: string) {
    const item = await this.detalleAdmin(id);
    await this.prisma.contentItem.delete({ where: { id } });

    await this.auth.auditar(actor.id, "contenido.eliminado", "content", id, ip, {
      kind: item.kind,
      slug: item.slug,
      titulo: item.title,
    });

    return { eliminado: true };
  }

  private campos(datos: ContenidoDto) {
    return {
      kind: datos.kind,
      slug: datos.slug,
      title: datos.title,
      summary: datos.summary,
      body: datos.body,
      programCode: datos.programCode,
      location: datos.location,
      startsOn: datos.startsOn ? new Date(datos.startsOn) : null,
      endsOn: datos.endsOn ? new Date(datos.endsOn) : null,
      goalAmount: datos.goalAmount ? new Prisma.Decimal(datos.goalAmount) : null,
      goalCurrency: datos.goalAmount ? (datos.goalCurrency ?? "PEN") : null,
      coverMediaId: datos.coverMediaId,
      status: datos.status,
    };
  }

  private async exigirSlugLibre(kind: string, slug: string, excepto?: string) {
    const existente = await this.prisma.contentItem.findUnique({
      where: { kind_slug: { kind, slug } },
      select: { id: true },
    });

    if (existente && existente.id !== excepto) {
      throw new ConflictException(
        `Ya existe un contenido de este tipo con la dirección «${slug}»`,
      );
    }
  }

  private vistaPublica(item: {
    kind: string;
    slug: string;
    title: string;
    summary: string;
    body: string;
    programCode: string | null;
    location: string | null;
    startsOn: Date | null;
    endsOn: Date | null;
    goalAmount: Prisma.Decimal | null;
    goalCurrency: string | null;
    publishedAt: Date | null;
    portada: {
      storageKey: string;
      altText: string | null;
      width: number | null;
      height: number | null;
    } | null;
  }) {
    return {
      kind: item.kind,
      slug: item.slug,
      title: item.title,
      summary: item.summary,
      // El cuerpo viaja en párrafos: el sitio los pinta, nadie inyecta marcado.
      parrafos: item.body.split(/\n{2,}/).map((p) => p.trim()).filter(Boolean),
      programCode: item.programCode,
      location: item.location,
      startsOn: item.startsOn,
      endsOn: item.endsOn,
      goalAmount: item.goalAmount?.toString() ?? null,
      goalCurrency: item.goalCurrency,
      publishedAt: item.publishedAt,
      portada: item.portada
        ? {
            url: `/api/v1/media/${item.portada.storageKey}`,
            altText: item.portada.altText,
            width: item.portada.width,
            height: item.portada.height,
          }
        : null,
    };
  }
}
