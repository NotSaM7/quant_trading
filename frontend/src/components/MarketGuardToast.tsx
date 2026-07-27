import React from 'react';
import { Box, Typography, Button } from '@mui/material';

export interface MarketGuardStatus {
  allowed: boolean;
  title: string;
  message: string;
  icon: string;
}

export function getISTDate(): { day: number; h: number; m: number; dayName: string } {
  const d = new Date(new Date().toLocaleString('en-US', { timeZone: 'Asia/Kolkata' }));
  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  return { day: d.getDay(), h: d.getHours(), m: d.getMinutes(), dayName: dayNames[d.getDay()] };
}

export function isWeekend(): boolean {
  const { day } = getISTDate();
  return day === 0 || day === 6;
}

export function isMarketOpen(): boolean {
  if (isWeekend()) return false;
  const { h, m } = getISTDate();
  const mins = h * 60 + m;
  return mins >= 9 * 60 + 15 && mins < 15 * 60 + 30; // 9:15 AM to 3:30 PM IST
}

export function checkMarketGuard(): MarketGuardStatus {
  const { h, m, dayName } = getISTDate();

  if (isWeekend()) {
    return {
      allowed: false,
      title: `Market Closed — ${dayName}`,
      message: `NSE does not trade on weekends. The next trading session opens on Monday at 9:15 AM IST.`,
      icon: '🔴'
    };
  }

  if (!isMarketOpen()) {
    const mins = h * 60 + m;
    let msg = '';
    if (mins < 9 * 60) {
      msg = `Market opens at 9:15 AM IST today. Pre-market session begins at 9:00 AM.`;
    } else if (mins < 9 * 60 + 15) {
      msg = `Pre-market session is currently active (9:00–9:15 AM). Regular trading starts at 9:15 AM IST.`;
    } else {
      msg = `Market closed for today at 3:30 PM IST. Regular trading resumes tomorrow at 9:15 AM IST.`;
    }
    return {
      allowed: false,
      title: 'Market is Currently Closed',
      message: msg,
      icon: '🔔'
    };
  }

  return {
    allowed: true,
    title: 'Market Open',
    message: 'Trading session is active.',
    icon: '🟢'
  };
}

interface MarketGuardToastProps {
  open: boolean;
  status: MarketGuardStatus | null;
  onClose: () => void;
}

export const MarketGuardToast: React.FC<MarketGuardToastProps> = ({ open, status, onClose }) => {
  if (!open || !status) return null;

  return (
    <Box className="mkt-closed-toast-container">
      <Box sx={{ fontSize: 32, mb: 1 }}>{status.icon}</Box>

      <Typography variant="h6" fontWeight="800" sx={{ color: 'white', fontSize: '16px', mb: 0.8, fontFamily: '"Outfit", sans-serif' }}>
        {status.title}
      </Typography>

      <Typography variant="body2" sx={{ color: '#7C7C8A', fontSize: '13px', lineHeight: 1.6, mb: 2, fontFamily: '"Outfit", sans-serif' }}>
        {status.message}
      </Typography>

      {/* Hours Grid */}
      <Box sx={{ display: 'flex', gap: 2, justifyContent: 'center', mb: 2 }}>
        <Box sx={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', p: '8px 14px', textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: '#B3B3B3', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '10px', display: 'block', mb: 0.3 }}>
            TRADING DAYS
          </Typography>
          <Typography variant="body2" sx={{ color: 'white', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>
            Mon – Fri
          </Typography>
        </Box>

        <Box sx={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', p: '8px 14px', textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: '#B3B3B3', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '10px', display: 'block', mb: 0.3 }}>
            MARKET HOURS
          </Typography>
          <Typography variant="body2" sx={{ color: 'white', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>
            9:15 AM – 3:30 PM
          </Typography>
        </Box>

        <Box sx={{ background: 'rgba(255,255,255,0.05)', border: '1px solid rgba(255,255,255,0.08)', borderRadius: '10px', p: '8px 14px', textAlign: 'center' }}>
          <Typography variant="caption" sx={{ color: '#B3B3B3', fontWeight: 600, letterSpacing: '1px', textTransform: 'uppercase', fontSize: '10px', display: 'block', mb: 0.3 }}>
            TIMEZONE
          </Typography>
          <Typography variant="body2" sx={{ color: 'white', fontWeight: 700, fontFamily: 'JetBrains Mono, monospace', fontSize: '13px' }}>
            IST (UTC+5:30)
          </Typography>
        </Box>
      </Box>

      <Button
        onClick={onClose}
        sx={{
          py: 1,
          px: 3,
          borderRadius: '50px',
          border: '1px solid rgba(255,255,255,0.15)',
          color: '#7C7C8A',
          fontSize: '12px',
          fontWeight: 700,
          fontFamily: '"Outfit", sans-serif',
          textTransform: 'none',
          '&:hover': {
            color: 'white',
            borderColor: 'rgba(255,255,255,0.3)',
            bgcolor: 'rgba(255,255,255,0.05)'
          }
        }}
      >
        Understood
      </Button>
    </Box>
  );
};
