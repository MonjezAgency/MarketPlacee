/**
 * Design Tokens for Ali FMCG B2B Platform
 * Defines core colors, spacing, and transition constants.
 * Supports Light/Dark mode via CSS variables.
 */
export const BRAND_NAME = 'Ali FMCG';

export const designTokens = {
    colors: {
        primary: {
            light: '#1E3A8A', // Deep Blue
            dark: '#60A5FA',  // Light Blue for dark mode
        },
        secondary: {
            light: '#F59E0B', // Amber
            dark: '#FBBF24',  // Lighter Amber
        },
        success: {
            light: '#10B981', // Emerald Green
            dark: '#34D399',
        },
        accent: {
            light: '#F43F5E', // Vibrant Pink
            dark: '#FB7185',
        },
        background: {
            light: '#F3F4F6', // Light Gray
            dark: '#111827',  // Very Dark Blue/Gray
        },
        surface: {
            light: '#FFFFFF',
            dark: '#1F2937',
        },
        text: {
            primary: {
                light: '#111827',
                dark: '#F9FAFB',
            },
            secondary: {
                light: '#4B5563',
                dark: '#9CA3AF',
            }
        }
    },
    spacing: {
        xs: '0.25rem',
        sm: '0.5rem',
        md: '1rem',
        lg: '1.5rem',
        xl: '2rem',
        '2xl': '3rem',
    },
    borderRadius: {
        button: '8px',
        card: '12px',
        input: '8px',
    },
    transitions: {
        default: 'all 0.3s cubic-bezier(0.4, 0, 0.2, 1)',
        slow: 'all 0.5s cubic-bezier(0.4, 0, 0.2, 1)',
    },
    shadows: {
        subtle: '0 1px 3px 0 rgba(0, 0, 0, 0.1), 0 1px 2px 0 rgba(0, 0, 0, 0.06)',
        medium: '0 4px 6px -1px rgba(0, 0, 0, 0.1), 0 2px 4px -1px rgba(0, 0, 0, 0.06)',
        glow: '0 0 15px rgba(16, 185, 129, 0.3)', // Emerald glow
    }
};
