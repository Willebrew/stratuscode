import type { StratusCodeConfig, ProviderModelEntry } from '@stratuscode/shared';
import { PROVIDER_MODELS } from '@stratuscode/shared';

export interface ModelEntry {
  id: string;
  name: string;
  free?: boolean;
  providerKey?: string;
  group: string;
  reasoning?: boolean;
}

export function buildModelEntries(
  config: StratusCodeConfig,
  ollamaModels?: ProviderModelEntry[],
): ModelEntry[] {
  const items: ModelEntry[] = [];

  for (const model of PROVIDER_MODELS.openai?.models || []) {
    items.push({
      id: model.id,
      name: model.name,
      free: model.free,
      reasoning: model.reasoning,
      group: PROVIDER_MODELS.openai!.label,
    });
  }

  const providers = (config as any).providers as Record<string, any> | undefined;
  if (providers) {
    for (const [key, _providerConfig] of Object.entries(providers)) {
      const knownModels = PROVIDER_MODELS[key];
      if (knownModels) {
        for (const model of knownModels.models) {
          items.push({
            id: model.id,
            name: model.name,
            free: model.free,
            reasoning: model.reasoning,
            providerKey: key,
            group: knownModels.label,
          });
        }
      }
    }
  }

  if (ollamaModels && ollamaModels.length > 0) {
    for (const model of ollamaModels) {
      items.push({
        id: model.id,
        name: model.name,
        providerKey: 'ollama',
        group: 'Ollama (Local)',
      });
    }
  }

  return items;
}
