-- Aportes de una campaña que no pasan por la pasarela: transferencias, Yape
-- directo y gastos cubiertos en especie. Se registran a mano desde el panel.
ALTER TABLE "content_items" ADD COLUMN "offline_amount" DECIMAL(12,2);
ALTER TABLE "content_items" ADD COLUMN "offline_contributors" INTEGER;
