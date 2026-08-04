/**
 * Siembra el catálogo de los 12 CTA funcionales.
 * Espeja app/lib/cta/registry.ts del frontend: si allí se agrega un código,
 * hay que agregarlo aquí también.
 *
 *   npx tsx prisma/seed.ts   (o npm run prisma:seed)
 */
import { PrismaClient } from "@prisma/client";

const prisma = new PrismaClient();

const CATALOGO = [
  {
    code: "DONATE_ENTRY",
    label: "Donar ahora",
    destination: "/aportes",
    processType: "contribution",
    analyticsCategory: "conversion",
  },
  {
    code: "VIEW_PROGRAMS",
    label: "Conocer nuestros programas",
    destination: "/programas",
    processType: "navigation",
    analyticsCategory: "engagement",
  },
  {
    code: "VIEW_HEALTH_CAMPAIGNS",
    label: "Conocer campañas activas",
    destination: "/programas/salud-y-cuidado/campanas",
    processType: "navigation",
    analyticsCategory: "engagement",
  },
  {
    code: "VIEW_EDUCATION_INITIATIVES",
    label: "Conocer iniciativas educativas",
    destination: "/programas/semillas-de-educacion/iniciativas",
    processType: "navigation",
    analyticsCategory: "engagement",
  },
  {
    code: "VIEW_ENVIRONMENT_PROJECTS",
    label: "Conocer proyectos ambientales",
    destination: "/programas/bio-amazonia/proyectos",
    processType: "navigation",
    analyticsCategory: "engagement",
  },
  {
    code: "VIEW_PARTICIPATION_OPPORTUNITIES",
    label: "Ver oportunidades de participación",
    destination: "/participa",
    processType: "participation",
    analyticsCategory: "conversion",
  },
  {
    code: "PROPOSE_ALLIANCE",
    label: "Proponer una alianza",
    destination: "/alianzas/proponer",
    processType: "alliance",
    analyticsCategory: "conversion",
  },
  {
    code: "EVALUATE_INITIATIVE",
    label: "Evaluar mi iniciativa",
    destination: "/iniciativas/evaluacion",
    processType: "initiative_evaluation",
    analyticsCategory: "conversion",
  },
  {
    code: "REQUEST_INSTITUTIONAL_MEETING",
    label: "Solicitar una reunión institucional",
    destination: "/empresas/reunion",
    processType: "institutional_meeting",
    analyticsCategory: "conversion",
  },
  {
    code: "START_RECURRING_CONTRIBUTION",
    label: "Realizar un aporte mensual",
    destination: "/aportes",
    processType: "contribution",
    analyticsCategory: "conversion",
  },
  {
    code: "START_SINGLE_CONTRIBUTION",
    label: "Realizar un aporte único",
    destination: "/aportes",
    processType: "contribution",
    analyticsCategory: "conversion",
  },
  {
    code: "VIEW_TRANSPARENCY",
    label: "Consultar transparencia y metodología",
    destination: "/transparencia",
    processType: "transparency",
    analyticsCategory: "verification",
  },
];

async function main() {
  for (const definicion of CATALOGO) {
    await prisma.ctaDefinition.upsert({
      where: { code: definicion.code },
      create: definicion,
      update: {
        label: definicion.label,
        destination: definicion.destination,
        processType: definicion.processType,
        analyticsCategory: definicion.analyticsCategory,
      },
    });
  }
  console.log(`Catálogo sembrado: ${CATALOGO.length} CTA funcionales`);
}

main()
  .catch((error) => {
    console.error(error);
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
