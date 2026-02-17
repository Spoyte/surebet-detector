import React, { createContext, useContext } from 'react';

const ThemeContext = createContext({});

export const theme = {
  colors: {
    background: '#0a0a0a',
    surface: '#1a1a1a',
    surfaceHighlight: '#252525',
    border: '#333',
    borderHighlight: '#444',
    
    primary: '#00ff88',
    primaryDark: '#00cc6a',
    
    text: '#ffffff',
    textSecondary: '#888888',
    textMuted: '#666666',
    
    success: '#00ff88',
    warning: '#ffcc00',
    error: '#ff4444',
    info: '#00ccff',
    
    live: '#ff4444',
  },
  
  spacing: {
    xs: 4,
    sm: 8,
    md: 16,
    lg: 24,
    xl: 32,
  },
  
  borderRadius: {
    sm: 4,
    md: 8,
    lg: 12,
    xl: 16,
    full: 9999,
  },
  
  typography: {
    h1: {
      fontSize: 28,
      fontWeight: 'bold',
    },
    h2: {
      fontSize: 24,
      fontWeight: 'bold',
    },
    h3: {
      fontSize: 20,
      fontWeight: '600',
    },
    body: {
      fontSize: 16,
      fontWeight: 'normal',
    },
    caption: {
      fontSize: 12,
      fontWeight: 'normal',
    },
  },
};

export function ThemeProvider({ children }) {
  return (
    <ThemeContext.Provider value={theme}>
      {children}
    </ThemeContext.Provider>
  );
}

export function useTheme() {
  return useContext(ThemeContext);
}
