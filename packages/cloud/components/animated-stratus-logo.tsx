'use client';

import { useEffect, useRef } from 'react';
import clsx from 'clsx';

interface AnimatedStratusLogoProps {
    mode: 'thinking' | 'generating' | 'idle' | 'static';
    className?: string;
    size?: number;
    strokeColor?: string;
}

const STRATUS_PATH = "M 506 22 C 410.06 64.94, 313.9 102.74, 214.33 141.84 C 204.78 146.93, 191.66 154.41, 189.46 166 C 184.54 191.79, 212.94 197.28, 231.82 201.73 C 277.94 212.6, 329 217.87, 374.02 230.53 C 442.21 249.69, 451.38 316.47, 340.77 391.31 C 295.98 406.28, 247 418.34, 201.22 430.76 C 150.96 444.39, 100.48 457.26, 50 470 C 49.44 467.72, 52.77 466.71, 54.33 465.85 C 57.96 463.83, 62.01 462.08, 65.78 460.29 C 152.38 419.29, 242.2 384.69, 329.35 344.86 C 344.61 338.11, 370.19 321.13, 358.83 301.66 C 352.91 291.53, 339.13 287.01, 328.42 284.07 C 277.13 270.01, 218.08 267.1, 167.78 251.71 C 72 222.4, 108.26 117.4, 188.21 97.71 C 289.54 73.15, 390.45 46.48, 492.22 23.72 C 493.2 23.5, 508.74 18.05, 506 22 Z";

export function AnimatedStratusLogo({ mode, className = '', size = 20, strokeColor = 'currentColor' }: AnimatedStratusLogoProps) {
    const pathRef = useRef<SVGPathElement>(null);

    useEffect(() => {
        if ((mode === 'generating' || mode === 'thinking') && pathRef.current) {
            const length = pathRef.current.getTotalLength();
            pathRef.current.style.setProperty('--path-length', length.toFixed(2));
        }
    }, [mode]);

    if (mode === 'thinking') {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 550 514"
                width={size}
                height={size}
                className={clsx('stratus-think', className)}
                style={{ '--animation-duration': '1.6s' } as React.CSSProperties}
            >
                <style dangerouslySetInnerHTML={{
                    __html: `
          .stratus-think {
            overflow: visible;
          }
          .stratus-think path {
            fill: none;
            stroke: ${strokeColor};
            stroke-width: 25;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-dasharray: var(--path-length);
            animation: stratus-think-anim var(--animation-duration) ease-in-out infinite;
          }
          @keyframes stratus-think-anim {
            0%, 100% { stroke-dashoffset: var(--path-length); }
            50% { stroke-dashoffset: 0; }
          }
        `}} />
                <path ref={pathRef} d={STRATUS_PATH} />
            </svg>
        );
    }

    if (mode === 'generating') {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 550 514"
                width={size}
                height={size}
                className={clsx('stratus-gen', className)}
                style={{ '--animation-duration': '2.4s' } as React.CSSProperties}
            >
                <style dangerouslySetInnerHTML={{
                    __html: `
          .stratus-gen {
            overflow: visible;
          }
          .stratus-gen path {
            fill: none;
            stroke: ${strokeColor};
            stroke-width: 25;
            stroke-linecap: round;
            stroke-linejoin: round;
            stroke-dasharray: var(--path-length);
            opacity: 0.5;
            animation: stratus-gen-anim var(--animation-duration) ease-in-out infinite;
          }
          @keyframes stratus-gen-anim {
            0%, 100% { stroke-dashoffset: var(--path-length); opacity: 0.3; }
            50% { stroke-dashoffset: 0; opacity: 0.6; }
          }
        `}} />
                <path ref={pathRef} d={STRATUS_PATH} />
            </svg>
        );
    }

    if (mode === 'idle') {
        return (
            <svg
                xmlns="http://www.w3.org/2000/svg"
                viewBox="0 0 550 514"
                width={size}
                height={size}
                className={clsx('transition-all duration-500 ease-in-out', className)}
            >
                <path
                    d={STRATUS_PATH}
                    fill="currentColor"
                    className="transition-all duration-500 ease-in-out"
                    style={{ strokeWidth: 0, opacity: 0.6 }}
                />
            </svg>
        );
    }

    // Static mode
    return (
        <svg
            xmlns="http://www.w3.org/2000/svg"
            viewBox="0 0 550 514"
            width={size}
            height={size}
            className={className}
        >
            <path d={STRATUS_PATH} fill="currentColor" />
        </svg>
    );
}
