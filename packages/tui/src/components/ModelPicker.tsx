/**
 * Model Picker Component
 *
 * Interactive model selection grouped by provider.
 * Supports arrow key navigation, Enter to select, Esc to cancel.
 */

import React, { useState, useMemo } from 'react';
import { Box, Text, useInput } from 'ink';
import type { StratusCodeConfig } from '@stratuscode/shared';
import { PROVIDER_MODELS } from '@stratuscode/shared';
import { colors } from '../theme/colors';

// ============================================
// Types
// ============================================

interface ModelEntry {
  id: string;            // API model ID
  name: string;          // Display name
  free?: boolean;
  providerKey?: string;  // key in config.providers (undefined = default provider)
  group: string;         // display group name
}

export interface ModelPickerProps {
  config: StratusCodeConfig;
  currentModel: string;
  onSelect: (model: string, providerKey?: string) => void;
  onClose: () => void;
}

// ============================================
// Component
// ============================================

export function ModelPicker({ config, currentModel, onSelect, onClose }: ModelPickerProps) {
  const entries = useMemo(() => {
    const items: ModelEntry[] = [];

    // OpenAI models (always available)
    for (const model of PROVIDER_MODELS.openai?.models || []) {
      items.push({ id: model.id, name: model.name, free: model.free, group: PROVIDER_MODELS.openai!.label });
    }

    // Named providers
    const providers = (config as any).providers as Record<string, any> | undefined;
    if (providers) {
      for (const [key, _providerConfig] of Object.entries(providers)) {
        const knownModels = PROVIDER_MODELS[key];
        if (knownModels) {
          for (const model of knownModels.models) {
            items.push({ id: model.id, name: model.name, free: model.free, providerKey: key, group: knownModels.label });
          }
        }
      }
    }

    return items;
  }, [config]);

  const [selectedIndex, setSelectedIndex] = useState(() => {
    const idx = entries.findIndex(e => e.id === currentModel);
    return idx >= 0 ? idx : 0;
  });
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');

  useInput((input, key) => {
    if (customMode) {
      if (key.escape) {
        setCustomMode(false);
        setCustomInput('');
        return;
      }
      if (key.return && customInput.trim()) {
        onSelect(customInput.trim());
        return;
      }
      if (key.backspace || key.delete) {
        setCustomInput(prev => prev.slice(0, -1));
        return;
      }
      if (input && !key.ctrl && !key.meta) {
        setCustomInput(prev => prev + input);
      }
      return;
    }

    if (key.escape) {
      onClose();
      return;
    }

    if (key.upArrow) {
      setSelectedIndex(i => Math.max(0, i - 1));
      return;
    }

    if (key.downArrow) {
      // +1 for the custom input row
      setSelectedIndex(i => Math.min(entries.length, i + 1));
      return;
    }

    if (key.return) {
      if (selectedIndex === entries.length) {
        // Custom input row
        setCustomMode(true);
        return;
      }
      const entry = entries[selectedIndex];
      if (entry) {
        onSelect(entry.id, entry.providerKey);
      }
      return;
    }
  });

  // Group entries for display
  let lastGroup = '';

  return (
    <Box flexDirection="column" paddingX={1} flexGrow={1}>
      <Box marginBottom={1}>
        <Text bold color={colors.primary}>Select Model</Text>
      </Box>
      <Box marginBottom={1}>
        <Text color={colors.textDim}>{'─'.repeat(40)}</Text>
      </Box>

      {entries.map((entry, index) => {
        const showGroup = entry.group !== lastGroup;
        lastGroup = entry.group;
        const isFocused = index === selectedIndex && !customMode;
        const isCurrent = entry.id === currentModel;

        return (
          <React.Fragment key={`${entry.providerKey || 'default'}-${entry.id}`}>
            {showGroup && (
              <Box marginTop={index > 0 ? 1 : 0} marginBottom={0}>
                <Text bold color={colors.secondary}>{entry.group}</Text>
              </Box>
            )}
            <Box>
              <Text color={isFocused ? colors.primary : colors.textDim}>
                {isFocused ? '  > ' : '    '}
              </Text>
              {isCurrent && (
                <Text color={colors.success}>{'● '}</Text>
              )}
              <Text color={isFocused ? colors.text : colors.textMuted} bold={isFocused}>
                {entry.name}
              </Text>
              {entry.free && (
                <Text color={colors.success}> Free</Text>
              )}
            </Box>
          </React.Fragment>
        );
      })}

      {/* Custom model input */}
      <Box marginTop={1}>
        <Text color={selectedIndex === entries.length && !customMode ? colors.primary : colors.textDim}>
          {selectedIndex === entries.length && !customMode ? '  > ' : '    '}
        </Text>
        {customMode ? (
          <Box>
            <Text color={colors.text}>[Custom]: </Text>
            <Text color={colors.primary}>{customInput}</Text>
            <Text color={colors.textDim}>|</Text>
          </Box>
        ) : (
          <Text color={selectedIndex === entries.length ? colors.text : colors.textMuted} italic>
            Type custom model...
          </Text>
        )}
      </Box>

      <Box marginTop={1}>
        <Text color={colors.textDim}>
          {customMode
            ? 'Type model name | Enter confirm | Esc back'
            : 'Up/Down navigate | Enter select | Esc cancel'}
        </Text>
      </Box>
    </Box>
  );
}
