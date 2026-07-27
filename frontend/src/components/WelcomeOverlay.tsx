import React, { useState, useEffect } from 'react';
import { Box, Typography, Button, LinearProgress } from '@mui/material';
import { getISTDate, isMarketOpen, isWeekend } from './MarketGuardToast';

interface WelcomeOverlayProps {
  user?: { name: string; email: string } | null;
  isAuthenticated: boolean;
  openAuthModal: (mode: 'login' | 'register') => void;
}

export const WelcomeOverlay: React.FC<WelcomeOverlayProps> = ({ user, isAuthenticated, openAuthModal }) => {
  const [open, setOpen] = useState(true);
  const [countdown, setCountdown] = useState(5);
  const [marketStatus, setMarketStatus] = useState<{ text: string; type: 'open' | 'closed' | 'weekend' }>({
    text: 'Checking market...',
    type: 'closed'
  });

  useEffect(() => {
    const { day, h, m } = getISTDate();
    const mins = h * 60 + m;

    if (isWeekend()) {
      setMarketStatus({ text: 'NSE MARKET IS CLOSED FOR WEEKEND', type: 'weekend' });
    } else if (isMarketOpen()) {
      setMarketStatus({ text: 'NSE / BSE LIVE MARKET OPEN', type: 'open' });
    } else {
      if (mins < 9 * 60 + 15) {
        setMarketStatus({ text: 'MARKET WILL OPEN AT 9:15 AM TODAY', type: 'closed' });
      } else {
        if (day === 5) {
          setMarketStatus({ text: 'NSE MARKET IS CLOSED FOR WEEKEND', type: 'weekend' });
        } else {
          setMarketStatus({ text: 'MARKET WILL OPEN AT 9:15 AM TOMORROW', type: 'closed' });
        }
      }
    }

    // Only auto-dismiss countdown if user is authenticated
    let timer: any = null;
    if (isAuthenticated) {
      timer = setInterval(() => {
        setCountdown((prev) => {
          if (prev <= 1) {
            clearInterval(timer);
            setOpen(false);
            return 0;
          }
          return prev - 1;
        });
      }, 1000);
    }

    return () => {
      if (timer) clearInterval(timer);
    };
  }, [isAuthenticated]);

  if (!open) return null;

  const formattedDate = new Date().toLocaleDateString('en-IN', {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'Asia/Kolkata'
  });

  const displayName = user?.name ? user.name : 'Trader';

  return (
    <Box className="welcome-overlay-container">
      <Box className="welcome-card-box">
        {/* Animated Brand Icon Logo */}
        <Box className="welcome-logo-icon">📊</Box>

        <Typography variant="h5" fontWeight="800" sx={{ color: 'white', letterSpacing: '-0.5px', mb: 0.5, fontFamily: '"Outfit", sans-serif', fontSize: '25px' }}>
          {isAuthenticated ? `Welcome back, ${displayName}!` : 'Welcome to QuantBot Trading Platform!'}
        </Typography>

        <Typography variant="body2" sx={{ color: '#B3B3B3', fontSize: '13px', mb: 3, fontFamily: '"Outfit", sans-serif' }}>
          {formattedDate} · NSE / BSE
        </Typography>

        {/* IST Market Status Badge */}
        <Box
          sx={{
            display: 'inline-flex',
            alignItems: 'center',
            gap: 1,
            px: 2.2,
            py: 0.9,
            borderRadius: '50px',
            fontSize: '12px',
            fontWeight: 700,
            letterSpacing: '0.5px',
            textTransform: 'uppercase',
            mb: 3,
            bgcolor: marketStatus.type === 'open' ? 'rgba(29, 185, 84, 0.15)' : marketStatus.type === 'weekend' ? 'rgba(168, 85, 247, 0.15)' : 'rgba(233, 20, 41, 0.15)',
            border: marketStatus.type === 'open' ? '1px solid rgba(29, 185, 84, 0.35)' : marketStatus.type === 'weekend' ? '1px solid rgba(168, 85, 247, 0.35)' : '1px solid rgba(233, 20, 41, 0.35)',
            color: marketStatus.type === 'open' ? '#1DB954' : marketStatus.type === 'weekend' ? '#a855f7' : '#E91429'
          }}
        >
          <Box
            sx={{
              width: 7,
              height: 7,
              borderRadius: '50%',
              bgcolor: 'currentColor',
              animation: 'pulse-dot 2s infinite'
            }}
          />
          <span>{marketStatus.text}</span>
        </Box>

        {/* Market Schedule Grid */}
        <Box
          sx={{
            display: 'grid',
            gridTemplateColumns: '1fr 1fr',
            gap: 1.2,
            mb: 3.5,
            textAlign: 'left'
          }}
        >
          <Box sx={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', p: 1.5 }}>
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#B3B3B3', display: 'block', mb: 0.5 }}>
              TRADING DAYS
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 700, color: 'white', fontFamily: 'JetBrains Mono, monospace' }}>
              Mon — Fri
            </Typography>
          </Box>

          <Box sx={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', p: 1.5 }}>
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#B3B3B3', display: 'block', mb: 0.5 }}>
              MARKET HOURS (IST)
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 700, color: 'white', fontFamily: 'JetBrains Mono, monospace' }}>
              9:15 AM – 3:30 PM
            </Typography>
          </Box>

          <Box sx={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', p: 1.5 }}>
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#B3B3B3', display: 'block', mb: 0.5 }}>
              PRE-MARKET SESSION
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 700, color: 'white', fontFamily: 'JetBrains Mono, monospace' }}>
              9:00 – 9:15 AM
            </Typography>
          </Box>

          <Box sx={{ background: 'rgba(255,255,255,0.04)', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '12px', p: 1.5 }}>
            <Typography variant="caption" sx={{ fontSize: '10px', fontWeight: 700, letterSpacing: '1.2px', textTransform: 'uppercase', color: '#B3B3B3', display: 'block', mb: 0.5 }}>
              WEEKEND / HOLIDAYS
            </Typography>
            <Typography variant="body2" sx={{ fontSize: '13px', fontWeight: 700, color: 'white', fontFamily: 'JetBrains Mono, monospace' }}>
              Market Closed
            </Typography>
          </Box>
        </Box>

        {isAuthenticated ? (
          <>
            {/* 5-Second Countdown Progress Bar */}
            <Box sx={{ bgcolor: 'rgba(255,255,255,0.06)', borderRadius: '50px', height: '4px', mb: 1.2, overflow: 'hidden' }}>
              <LinearProgress
                variant="determinate"
                value={(countdown / 5) * 100}
                sx={{
                  height: '100%',
                  bgcolor: 'transparent',
                  '& .MuiLinearProgress-bar': {
                    background: 'linear-gradient(90deg, #1DB954, #1ed760)'
                  }
                }}
              />
            </Box>

            <Typography variant="caption" sx={{ fontSize: '12px', color: '#B3B3B3', display: 'block', mb: 2.5 }}>
              Continuing in <span style={{ color: 'white', fontWeight: 700 }}>{countdown}</span>s
            </Typography>

            <Button
              variant="contained"
              onClick={() => setOpen(false)}
              sx={{
                py: 1.5,
                px: 4.5,
                borderRadius: '50px',
                background: 'linear-gradient(135deg, #1DB954, #1ed760)',
                color: '#000000 !important',
                fontFamily: '"Outfit", sans-serif',
                fontSize: '14px',
                fontWeight: 800,
                boxShadow: '0 4px 20px rgba(29,185,84,0.3)',
                transition: 'all 0.25s ease',
                '&:hover': {
                  background: 'linear-gradient(135deg, #1ed760, #1DB954)',
                  transform: 'translateY(-2px)',
                  boxShadow: '0 8px 30px rgba(29,185,84,0.4)'
                }
              }}
            >
              Continue to Dashboard →
            </Button>
          </>
        ) : (
          <Box sx={{ display: 'flex', flexDirection: 'column', gap: 2, alignItems: 'center', width: '100%' }}>
            <Box sx={{ display: 'flex', gap: 1.5, justifyContent: 'center', width: '100%' }}>
              <Button
                variant="contained"
                onClick={() => { setOpen(false); openAuthModal('login'); }}
                sx={{
                  py: 1.3,
                  px: 4,
                  borderRadius: '50px',
                  background: 'linear-gradient(135deg, #1DB954, #1ed760)',
                  color: '#000000 !important',
                  fontFamily: '"Outfit", sans-serif',
                  fontSize: '14px',
                  fontWeight: 800,
                  boxShadow: '0 4px 20px rgba(29,185,84,0.3)',
                  flex: 1,
                  transition: 'all 0.25s ease',
                  '&:hover': {
                    background: '#1ed760',
                    transform: 'translateY(-2px)',
                    boxShadow: '0 8px 25px rgba(29,185,84,0.5)'
                  }
                }}
              >
                Sign In
              </Button>
              <Button
                variant="outlined"
                onClick={() => { setOpen(false); openAuthModal('register'); }}
                sx={{
                  py: 1.3,
                  px: 4,
                  borderRadius: '50px',
                  border: '1px solid rgba(255,255,255,0.2)',
                  color: 'white !important',
                  fontFamily: '"Outfit", sans-serif',
                  fontSize: '14px',
                  fontWeight: 700,
                  flex: 1,
                  bgcolor: 'rgba(255,255,255,0.05)',
                  transition: 'all 0.25s ease',
                  '&:hover': {
                    borderColor: '#1DB954',
                    color: '#1DB954 !important',
                    bgcolor: 'rgba(29,185,84,0.1)',
                    transform: 'translateY(-2px)'
                  }
                }}
              >
                Create Account
              </Button>
            </Box>

            <Typography
              variant="caption"
              onClick={() => setOpen(false)}
              sx={{
                color: '#B3B3B3',
                fontSize: '12px',
                cursor: 'pointer',
                fontFamily: '"Outfit", sans-serif',
                transition: 'color 0.2s ease',
                '&:hover': { color: '#1DB954', textDecoration: 'underline' }
              }}
            >
              Explore as Guest →
            </Typography>
          </Box>
        )}
      </Box>
    </Box>
  );
};
