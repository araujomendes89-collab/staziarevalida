/**
 * Validador mínimo de JSON Schema para as respostas estruturadas da IA (tipos, obrigatórios,
 * enum, limites de tamanho, itens de lista, propriedades extras proibidas). Resposta fora do
 * formato é recusada — nunca "consertada".
 */
export type Schema = {
  type: "object" | "array" | "string" | "number" | "integer" | "boolean";
  properties?: Record<string, Schema>;
  required?: string[];
  additionalProperties?: boolean;
  items?: Schema;
  enum?: (string | number)[];
  minLength?: number;
  maxLength?: number;
  minItems?: number;
  maxItems?: number;
  minimum?: number;
  maximum?: number;
  nullable?: boolean;
  description?: string;
};

export function validate(schema: Schema, value: unknown, path = "$"): string[] {
  const errors: string[] = [];
  if (value === null && schema.nullable) return errors;
  switch (schema.type) {
    case "object": {
      if (typeof value !== "object" || value === null || Array.isArray(value)) return [`${path}: precisa ser objeto`];
      const obj = value as Record<string, unknown>;
      for (const key of schema.required ?? []) if (!(key in obj)) errors.push(`${path}.${key}: obrigatório`);
      for (const [key, v] of Object.entries(obj)) {
        const sub = schema.properties?.[key];
        if (!sub) {
          if (schema.additionalProperties === false) errors.push(`${path}.${key}: campo não previsto`);
          continue;
        }
        errors.push(...validate(sub, v, `${path}.${key}`));
      }
      break;
    }
    case "array": {
      if (!Array.isArray(value)) return [`${path}: precisa ser lista`];
      if (schema.minItems !== undefined && value.length < schema.minItems) errors.push(`${path}: mínimo de ${schema.minItems} itens`);
      if (schema.maxItems !== undefined && value.length > schema.maxItems) errors.push(`${path}: máximo de ${schema.maxItems} itens`);
      value.forEach((item, i) => schema.items && errors.push(...validate(schema.items, item, `${path}[${i}]`)));
      break;
    }
    case "string":
      if (typeof value !== "string") return [`${path}: precisa ser texto`];
      if (schema.minLength !== undefined && value.length < schema.minLength) errors.push(`${path}: texto curto demais`);
      if (schema.maxLength !== undefined && value.length > schema.maxLength) errors.push(`${path}: texto longo demais`);
      if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: valor fora da lista (${value})`);
      break;
    case "integer":
    case "number":
      if (typeof value !== "number" || Number.isNaN(value) || (schema.type === "integer" && !Number.isInteger(value))) return [`${path}: precisa ser número`];
      if (schema.minimum !== undefined && value < schema.minimum) errors.push(`${path}: abaixo do mínimo`);
      if (schema.maximum !== undefined && value > schema.maximum) errors.push(`${path}: acima do máximo`);
      if (schema.enum && !schema.enum.includes(value)) errors.push(`${path}: valor fora da lista`);
      break;
    case "boolean":
      if (typeof value !== "boolean") return [`${path}: precisa ser verdadeiro/falso`];
      break;
  }
  return errors;
}

/**
 * Converte para o formato aceito pelos provedores (sem as extensões próprias). Os provedores não recebem maxLength nem
 * maxItems, mas a conferência recusa o que passa deles: por isso cada limite vai escrito na descrição do campo, para a IA
 * saber dele antes de responder.
 */
export function toProviderSchema(schema: Schema): Record<string, unknown> {
  const out: Record<string, unknown> = { type: schema.type };
  const limit = schema.type === "string" && schema.maxLength !== undefined ? `Máximo de ${schema.maxLength} caracteres.` : schema.type === "array" && schema.maxItems !== undefined ? `No máximo ${schema.maxItems} itens.` : null;
  const description = [schema.description, limit].filter(Boolean).join(" ");
  if (description) out.description = description;
  if (schema.enum) out.enum = schema.enum;
  if (schema.properties) out.properties = Object.fromEntries(Object.entries(schema.properties).map(([k, v]) => [k, toProviderSchema(v)]));
  if (schema.required) out.required = schema.required;
  if (schema.type === "object" && schema.additionalProperties === false) out.additionalProperties = false;
  if (schema.items) out.items = toProviderSchema(schema.items);
  if (schema.nullable) out.nullable = true;
  return out;
}
