"use client";

import { useActionState } from "react";
import { Field, Input, Select } from "@/components/ui/field";
import { FormMessage } from "@/components/ui/form-message";
import { SubmitButton } from "@/components/ui/submit-button";
import { providerLabels } from "@/lib/labels";
import { addCohortProduct } from "../actions";

export function ProductsForm({ cohortId }: { cohortId: string }) {
  const [state, action] = useActionState(addCohortProduct.bind(null, cohortId), undefined);
  return (
    <form action={action} className="flex flex-col gap-3">
      <div className="grid gap-3 md:grid-cols-[1fr_1.5fr_1.5fr_auto] md:items-end">
        <Field label="Plataforma" htmlFor="provider" error={state?.errors?.provider}>
          <Select id="provider" name="provider" defaultValue="">
            <option value="" disabled>
              Escolha…
            </option>
            {Object.entries(providerLabels).map(([value, label]) => (
              <option key={value} value={value}>
                {label}
              </option>
            ))}
          </Select>
        </Field>
        <Field label="ID do produto" htmlFor="external_product_id" error={state?.errors?.external_product_id}>
          <Input id="external_product_id" name="external_product_id" autoComplete="off" />
        </Field>
        <Field label="Apelido (opcional)" htmlFor="label">
          <Input id="label" name="label" placeholder="Ex.: Oferta anúncios" />
        </Field>
        <SubmitButton variant="secondary" pendingText="Ligando…">
          Ligar produto
        </SubmitButton>
      </div>
      <FormMessage state={state} />
    </form>
  );
}
