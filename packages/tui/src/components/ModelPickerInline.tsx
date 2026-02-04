/**
 * ModelPickerInline
 *
 * Inline sheet variant of the model picker rendered inside UnifiedInput.
 */

import React, { useEffect, useMemo, useState } from 'react';
import { Box, Text, useInput } from 'ink';
import type { StratusCodeConfig } from '@stratuscode/shared';
import { PROVIDER_MODELS } from '@stratuscode/shared';
import { colors } from '../theme/colors';
import { InlineSheet } from './InlineSheet';

export interface ModelEntry {
  id: string;
  name: string;
  free?: boolean;
  providerKey?: string;
  group: string;
  reasoning?: boolean;
}

export interface ModelPickerInlineProps {
  entries: ModelEntry[];
  currentModel: string;
  onSelect: (model: string, providerKey?: string) => void;
  onClose: () => void;
}

const PAGE_SIZE = 10;

export function buildModelEntries(config: StratusCodeConfig): ModelEntry[] {
  const items: ModelEntry[] = [];

  for (const model of PROVIDER_MODELS.openai?.models || []) {
    items.push({ id: model.id, name: model.name, free: model.free, reasoning: model.reasoning, group: PROVIDER_MODELS.openai!.label });
  }

  const providers = (config as any).providers as Record<string, any> | undefined;
  if (providers) {
    for (const [key, _providerConfig] of Object.entries(providers)) {
      const knownModels = PROVIDER_MODELS[key];
      if (knownModels) {
        for (const model of knownModels.models) {
          items.push({ id: model.id, name: model.name, free: model.free, reasoning: model.reasoning, providerKey: key, group: knownModels.label });
        }
      }
    }
  }

  return items;
}

function filterModels(entries: ModelEntry[], query: string): ModelEntry[] {
  const q = query.trim().toLowerCase();
  if (!q) return entries;
  return entries.filter(e =>
    e.name.toLowerCase().includes(q) ||
    e.id.toLowerCase().includes(q) ||
    (e.providerKey && e.providerKey.toLowerCase().includes(q)) ||
    e.group.toLowerCase().includes(q)
  );
}

function sortByProvider(entries: ModelEntry[]): ModelEntry[] {
  const groups = new Map<string, ModelEntry[]>();
  for (const entry of entries) {
    const list = groups.get(entry.group) || [];
    list.push(entry);
    groups.set(entry.group, list);
  }

  const groupOrder = Array.from(groups.keys()).sort((a, b) => {
    const aIsOpenAI = a.toLowerCase() === 'openai';
    const bIsOpenAI = b.toLowerCase() === 'openai';
    if (aIsOpenAI && !bIsOpenAI) return -1;
    if (!aIsOpenAI && bIsOpenAI) return 1;
    return a.localeCompare(b);
  });

  const sorted: ModelEntry[] = [];
  for (const group of groupOrder) {
    const items = groups.get(group)!;
    items.sort((a, b) => a.name.localeCompare(b.name));
    sorted.push(...items);
  }
  return sorted;
}

export function ModelPickerInline({ entries, currentModel, onSelect, onClose }: ModelPickerInlineProps) {
  const [filter, setFilter] = useState('');
  const [selectedIndex, setSelectedIndex] = useState(0);
  const [offset, setOffset] = useState(0);
  const [customMode, setCustomMode] = useState(false);
  const [customInput, setCustomInput] = useState('');

  const filtered = useMemo(() => filterModels(entries, filter), [entries, filter]);
  const sorted = useMemo(() => sortByProvider(filtered), [filtered]);
  const total = sorted.length + 1; // +1 for custom row
  const clampedOffset = Math.max(0, Math.min(offset, Math.max(0, total - PAGE_SIZE)));
  const visible = sorted.slice(clampedOffset, clampedOffset + PAGE_SIZE);
  const customRowIndex = sorted.length;
  const scroll = (delta: number) => {
    setOffset(o => Math.max(0, Math.min(o + delta, Math.max(0, total - PAGE_SIZE))));
  };

  // Clamp selection when filter changes
  useEffect(() => {
    if (selectedIndex > sorted.length) {
      setSelectedIndex(Math.max(0, sorted.length));
    }
    setOffset(o => Math.max(0, Math.min(o, Math.max(0, total - PAGE_SIZE))));
  }, [sorted.length, total, selectedIndex]);

  // Default selection to current model when not filtering
  useEffect(() => {
    if (filter.trim().length === 0) {
      const idx = sorted.findIndex(e => e.id === currentModel);
      if (idx >= 0) setSelectedIndex(idx);
    }
  }, [filter, sorted, currentModel]);

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
      setSelectedIndex(i => {
        const next = Math.max(0, i - 1);
        if (next < clampedOffset) scroll(-1);
        return next;
      });
      return;
    }
    if (key.downArrow) {
      setSelectedIndex(i => {
        const next = Math.min(total - 1, i + 1);
        if (next >= clampedOffset + PAGE_SIZE) scroll(1);
        return next;
      });
      return;
    }
    if (input === '+' || key.pageDown) {
      scroll(PAGE_SIZE);
      setSelectedIndex(i => Math.min(total - 1, Math.max(clampedOffset + PAGE_SIZE - 1, i)));
      return;
    }
    if (input === '-' || key.pageUp) {
      scroll(-PAGE_SIZE);
      setSelectedIndex(i => Math.max(0, Math.min(clampedOffset, i)));
      return;
    }

    // Quick number select within visible window
    const num = parseInt(input, 10);
    if (!Number.isNaN(num) && num >= 1 && num <= Math.min(9, visible.length)) {
      const target = clampedOffset + (num - 1);
      setSelectedIndex(target);
      const entry = sorted[target];
      if (entry) onSelect(entry.id, entry.providerKey);
      return;
    }

    if (key.return) {
      if (selectedIndex === customRowIndex) {
        setCustomMode(true);
        return;
      }
      const entry = sorted[selectedIndex];
      if (entry) {
        onSelect(entry.id, entry.providerKey);
      }
      return;
    }

    if (key.backspace || key.delete) {
      setFilter(prev => prev.slice(0, -1));
      setOffset(0);
      return;
    }
    if (input && !key.ctrl && !key.meta) {
      setFilter(prev => prev + input);
      setOffset(0);
      return;
    }
  });

  return (
    <InlineSheet
      title="Select Model"
      icon="*"
      hint={`${selectedIndex + 1}/${total}`}
    >
      {/* Filter bar */}
      <Box>
        <Text color={colors.secondary}>/ </Text>
        <Text color={colors.text}>{filter || 'Search models...'}</Text>
        <Text color={colors.primary}>▎</Text>
      </Box>
      <Box>
        <Text color={colors.border}>{'─'.repeat(40)}</Text>
      </Box>

      {/* List */}
      {visible.map((entry, idx) => {
        const globalIndex = clampedOffset + idx;
        const isFocused = globalIndex === selectedIndex;
        const isCurrent = entry.id === currentModel;
        const showGroup = globalIndex === 0 || sorted[globalIndex - 1]?.group !== entry.group;
        return (
          <Box key={`${entry.providerKey || 'default'}-${entry.id}`} flexDirection="column">
            {showGroup && (
              <Box marginTop={idx > 0 ? 1 : 0}>
                <Text color={colors.textDim} bold>{entry.group}</Text>
              </Box>
            )}
            <Box>
              <Text color={isFocused ? colors.primary : colors.textDim}>
                {isFocused ? '› ' : '  '}
              </Text>
              {isCurrent && <Text color={colors.secondary}>● </Text>}
              <Text color={isFocused ? colors.text : colors.textMuted} bold={isFocused}>
                {entry.name}
              </Text>
              <Text color={colors.textDim}> ({entry.id})</Text>
              {entry.reasoning && <Text color={colors.secondary}> Thinking</Text>}
              {entry.free && <Text color={colors.success}> Free</Text>}
            </Box>
          </Box>
        );
      })}

      {/* Custom row */}
      <Box marginTop={1}>
        <Text color={selectedIndex === customRowIndex ? colors.primary : colors.textDim}>
          {selectedIndex === customRowIndex ? '› ' : '  '}
        </Text>
        {customMode ? (
          <>
            <Text color={colors.text}>Custom: {customInput}</Text>
            <Text color={colors.primary}>▎</Text>
          </>
        ) : (
          <Text color={selectedIndex === customRowIndex ? colors.text : colors.textMuted} italic>
            Type custom model...
          </Text>
        )}
      </Box>

      <Box marginTop={1} justifyContent="space-between">
        <Text color={colors.textDim}>↑↓ move • Enter select • Esc close</Text>
        <Text color={colors.textDim}>
          {clampedOffset > 0 ? `↑ ${clampedOffset} above` : ''} {total > clampedOffset + PAGE_SIZE ? `${total - (clampedOffset + PAGE_SIZE)} below ↓` : ''}
        </Text>
      </Box>
    </InlineSheet>
  );
}
