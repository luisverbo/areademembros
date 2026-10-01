import { asaas } from "./asaas";
import { hotmart } from "./hotmart";
import { kiwify } from "./kiwify";
import { mercadopago } from "./mercadopago";
import type { Adapter, Provider } from "./types";
import { yampi } from "./yampi";

export const adapters: Record<Provider, Adapter> = { kiwify, hotmart, yampi, mercadopago, asaas };

export function isProvider(value: string): value is Provider {
  return value in adapters;
}

export function isProviderConfigured(provider: Provider): boolean {
  return adapters[provider].requiredEnv.every((name) => Boolean(process.env[name]));
}
