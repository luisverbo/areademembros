"use client";

import { useActionState, useState, useTransition } from "react";
import { Badge } from "@/components/ui/badge";
import { Button } from "@/components/ui/button";
import { Checkbox, Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { providerLabels } from "@/lib/labels";
import { addModuleProduct, removeModuleProduct, updateModuleAddon } from "../actions";

type Product = { id: string; provider: keyof typeof providerLabels; external_product_id: string; label: string | null };

/** Módulo extra (order bump): fica no curso, com cadeado para quem não comprou o produto ligado. */
export function ModuleAddon({
  courseId,
  moduleId,
  isAddon,
  checkoutUrl,
  products,
  grants,
}: {
  courseId: string;
  moduleId: string;
  isAddon: boolean;
  checkoutUrl: string | null;
  products: Product[];
  grants: number;
}) {
  const [state, action, saving] = useActionState(updateModuleAddon.bind(null, moduleId, courseId), undefined);
  const [productState, productAction, adding] = useActionState(addModuleProduct.bind(null, moduleId, courseId), undefined);
  const [, start] = useTransition();
  const [enabled, setEnabled] = useState(isAddon);
  const id = (f: string) => `${moduleId}-${f}`;

  return (
    <div className="flex flex-col gap-4 p-3">
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          start(() => action(data));
        }}
        className="flex flex-col gap-3"
      >
        <Checkbox
          name="is_addon"
          checked={enabled}
          onChange={(e) => setEnabled(e.target.checked)}
          label={
            <>
              <b className="text-fg">Módulo extra pago à parte</b> (order bump). Aparece dentro do curso com cadeado; só quem comprar o
              produto ligado abaixo assiste.
            </>
          }
        />
        {enabled ? (
          <Field
            label="Link para comprar depois (opcional)"
            htmlFor={id("checkout")}
            error={state?.errors?.addon_checkout_url}
            hint="Aparece no botão “Desbloquear este extra” para quem não comprou. Ex.: checkout só do extra na Kiwify."
          >
            <Input
              id={id("checkout")}
              name="addon_checkout_url"
              type="url"
              defaultValue={checkoutUrl ?? ""}
              placeholder="https://pay.kiwify.com.br/…"
            />
          </Field>
        ) : null}
        <div className="flex flex-wrap items-center gap-3">
          <Button type="submit" size="sm" variant="secondary" disabled={saving}>
            {saving ? "Salvando…" : "Salvar"}
          </Button>
          {isAddon ? (
            <span className="text-fg-muted text-xs">
              {grants} aluno{grants === 1 ? "" : "s"} com este extra
            </span>
          ) : null}
          <FormMessage state={state} className="py-1 text-xs" />
        </div>
      </form>

      {isAddon ? (
        <div className="border-border flex flex-col gap-3 border-t pt-3">
          <p className="text-fg-soft text-sm font-medium">Produtos que liberam este módulo</p>
          {products.length ? (
            <ul className="flex flex-col gap-2">
              {products.map((p) => (
                <li key={p.id} className="border-border bg-surface flex items-center gap-2 rounded-lg border px-3 py-2 text-sm">
                  <Badge>{providerLabels[p.provider]}</Badge>
                  <code className="min-w-0 flex-1 truncate">{p.external_product_id}</code>
                  {p.label ? <span className="text-fg-muted">{p.label}</span> : null}
                  <form action={removeModuleProduct.bind(null, p.id, courseId)}>
                    <Button type="submit" size="sm" variant="ghost">
                      Remover
                    </Button>
                  </form>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-accent-soft text-xs">Nenhum produto ligado ainda: ninguém recebe este extra pela compra.</p>
          )}
          <form
            onSubmit={(e) => {
              e.preventDefault();
              const data = new FormData(e.currentTarget);
              start(() => productAction(data));
            }}
            className="grid gap-3 md:grid-cols-[1fr_1.5fr_1.5fr_auto] md:items-end"
          >
            <Field label="Plataforma" htmlFor={id("provider")} error={productState?.errors?.provider}>
              <Select id={id("provider")} name="provider" defaultValue="kiwify">
                {Object.entries(providerLabels).map(([value, label]) => (
                  <option key={value} value={value}>
                    {label}
                  </option>
                ))}
              </Select>
            </Field>
            <Field label="ID do produto do extra" htmlFor={id("product")} error={productState?.errors?.external_product_id}>
              <Input id={id("product")} name="external_product_id" autoComplete="off" />
            </Field>
            <Field label="Apelido (opcional)" htmlFor={id("label")}>
              <Input id={id("label")} name="label" placeholder="Ex.: Bump atualizações" />
            </Field>
            <Button type="submit" size="sm" variant="secondary" disabled={adding}>
              {adding ? "Ligando…" : "Ligar produto"}
            </Button>
          </form>
          <FormMessage state={productState} className="py-1 text-xs" />
        </div>
      ) : null}
    </div>
  );
}
