/**
 * SplashScreen Component
 *
 * Shows the StratusCode logo on startup until user sends first message.
 * Responsive - shows compact version on smaller terminals.
 */

import React from 'react';
import { Box, Text, useStdout } from 'ink';
import { colors } from '../theme/colors';

export interface SplashScreenProps {
  version: string;
  projectDir: string;
  model: string;
}

// Large ASCII logo - Stratus (white)
const STRATUS_LARGE = `
 ███████╗████████╗██████╗  █████╗ ████████╗██╗   ██╗███████╗
 ██╔════╝╚══██╔══╝██╔══██╗██╔══██╗╚══██╔══╝██║   ██║██╔════╝
 ███████╗   ██║   ██████╔╝███████║   ██║   ██║   ██║███████╗
 ╚════██║   ██║   ██╔══██╗██╔══██║   ██║   ██║   ██║╚════██║
 ███████║   ██║   ██║  ██║██║  ██║   ██║   ╚██████╔╝███████║
 ╚══════╝   ╚═╝   ╚═╝  ╚═╝╚═╝  ╚═╝   ╚═╝    ╚═════╝ ╚══════╝`;

// Large ASCII logo - Code (purple)
const CODE_LARGE = `
  ██████╗ ██████╗ ██████╗ ███████╗
 ██╔════╝██╔═══██╗██╔══██╗██╔════╝
 ██║     ██║   ██║██║  ██║█████╗  
 ██║     ██║   ██║██║  ██║██╔══╝  
 ╚██████╗╚██████╔╝██████╔╝███████╗
  ╚═════╝ ╚═════╝ ╚═════╝ ╚══════╝`;

// Purple color: RGB(134, 66, 236)
const CODE_COLOR = '#8642EC';

export function SplashScreen({ version, projectDir, model }: SplashScreenProps) {
  const { stdout } = useStdout();
  const columns = stdout?.columns ?? 80;
  const isCompact = columns < 100;

  // Truncate project dir if needed
  const maxPathLen = Math.max(20, columns - 40);
  const displayPath = projectDir.length > maxPathLen 
    ? '...' + projectDir.slice(-maxPathLen + 3)
    : projectDir;

  if (isCompact) {
    // Compact view for smaller terminals
    return (
      <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} padding={1}>
        <Box marginBottom={1}>
          <Text color="white" bold>Stratus</Text>
          <Text color={CODE_COLOR} bold>Code</Text>
        </Box>
        <Box flexDirection="column" alignItems="center">
          <Text color={colors.textDim}>v{version} • {model}</Text>
          <Text color={colors.textMuted}>{displayPath}</Text>
        </Box>
      </Box>
    );
  }

  return (
    <Box flexDirection="column" alignItems="center" justifyContent="center" flexGrow={1} padding={1}>
      {/* Text Logo - Stratus (white) + Code (purple) side by side */}
      <Box>
        <Text color="white" bold>{STRATUS_LARGE}</Text>
        <Text>    </Text>
        <Text color={CODE_COLOR} bold>{CODE_LARGE}</Text>
      </Box>

      {/* Info line */}
      <Box flexDirection="column" marginTop={1} alignItems="center">
        <Box>
          <Text color={colors.textDim}>Version </Text>
          <Text color={colors.text}>{version}</Text>
          <Text color={colors.textDim}>  •  Project </Text>
          <Text color={colors.text}>{displayPath}</Text>
          <Text color={colors.textDim}>  •  Model </Text>
          <Text color={colors.text}>{model}</Text>
        </Box>
      </Box>
    </Box>
  );
}
