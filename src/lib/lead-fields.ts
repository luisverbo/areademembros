export type LeadFields = "email" | "whatsapp" | "name_email" | "name_email_whatsapp";

export const leadFieldsLabels: Record<LeadFields, string> = {
  email: "Só e-mail",
  whatsapp: "Só WhatsApp",
  name_email: "Nome e e-mail",
  name_email_whatsapp: "Nome, e-mail e WhatsApp",
};

export function leadFieldsFor(mode: LeadFields) {
  return {
    name: mode === "name_email" || mode === "name_email_whatsapp",
    email: mode !== "whatsapp",
    whatsapp: mode === "whatsapp" || mode === "name_email_whatsapp",
  };
}
