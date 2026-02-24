'use client';

import { useState, useEffect, useRef } from 'react';

/**
 * Smoothly reveals text character-by-character at a controlled rate.
 * When the model generates tokens faster than the eye can comfortably read,
 * this hook buffers the incoming text and drips it out smoothly using rAF.
 *
 * @param targetText  The full text received so far (grows as tokens arrive)
 * @param isStreaming  Whether the stream is still active
 * @param charsPerFrame  How many characters to reveal per animation frame (~60fps)
 * @returns The smoothed text to render
 */
export function useSmoothedText(
    targetText: string,
    isStreaming: boolean,
    charsPerFrame: number = 3
): string {
    const [displayText, setDisplayText] = useState(targetText);
    const displayLenRef = useRef(targetText.length);
    const rafRef = useRef<number>(0);

    useEffect(() => {
        // Not streaming — show everything instantly
        if (!isStreaming) {
            displayLenRef.current = targetText.length;
            setDisplayText(targetText);
            return;
        }

        // If the target is already fully revealed, no animation needed
        if (displayLenRef.current >= targetText.length) {
            return;
        }

        const animate = () => {
            const currentLen = displayLenRef.current;
            const targetLen = targetText.length;

            if (currentLen < targetLen) {
                // Reveal a few characters per frame for butter-smooth text
                const nextLen = Math.min(currentLen + charsPerFrame, targetLen);
                displayLenRef.current = nextLen;
                setDisplayText(targetText.slice(0, nextLen));
                rafRef.current = requestAnimationFrame(animate);
            }
        };

        rafRef.current = requestAnimationFrame(animate);

        return () => {
            if (rafRef.current) cancelAnimationFrame(rafRef.current);
        };
    }, [targetText, isStreaming, charsPerFrame]);

    return displayText;
}
