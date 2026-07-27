import React, { useEffect, useState } from 'react';
import { Box } from '@mui/material';

interface TickerItem {
  symbol: string;
  price: number;
  change: string;
  isUp: boolean;
}

const DEFAULT_TICKERS: TickerItem[] = [
  { symbol: 'TCS.NS', price: 2294.30, change: '-0.36%', isUp: false },
  { symbol: 'TITAN.NS', price: 4706.10, change: '+0.03%', isUp: true },
  { symbol: 'SUNPHARMA.NS', price: 1971.50, change: '+0.07%', isUp: true },
  { symbol: 'WIPRO.NS', price: 177.25, change: '+0.13%', isUp: true },
  { symbol: 'HCLTECH.NS', price: 1285.10, change: '-0.85%', isUp: false },
  { symbol: 'RELIANCE.NS', price: 2845.50, change: '+1.23%', isUp: true },
  { symbol: 'HDFCBANK.NS', price: 1780.00, change: '-0.45%', isUp: false },
  { symbol: 'INFY.NS', price: 1905.30, change: '+2.11%', isUp: true },
  { symbol: 'BAJFINANCE.NS', price: 7220.00, change: '+0.87%', isUp: true },
  { symbol: 'ICICIBANK.NS', price: 1245.80, change: '+0.65%', isUp: true },
];

export const TickerStrip: React.FC = () => {
  const [tickers, setTickers] = useState<TickerItem[]>(DEFAULT_TICKERS);

  // Slowly simulate minor tick fluctuations
  useEffect(() => {
    const interval = setInterval(() => {
      setTickers(prev =>
        prev.map(t => {
          const delta = (Math.random() - 0.5) * 0.002;
          const newPrice = parseFloat((t.price * (1 + delta)).toFixed(2));
          const isUp = newPrice >= t.price;
          return {
            ...t,
            price: newPrice,
            isUp
          };
        })
      );
    }, 4000);

    return () => clearInterval(interval);
  }, []);

  // Duplicate items array for seamless infinite looping scroll
  const displayItems = [...tickers, ...tickers];

  return (
    <Box
      sx={{
        bgcolor: 'rgba(0, 0, 0, 0.85)',
        borderBottom: '1px solid rgba(255, 255, 255, 0.06)',
        overflow: 'hidden',
        height: '32px',
        display: 'flex',
        alignItems: 'center',
        position: 'relative',
        zIndex: 1000
      }}
    >
      <Box
        className="ticker-inner-scroll"
        sx={{
          display: 'flex',
          gap: '48px',
          whiteSpace: 'nowrap',
          paddingLeft: '20px',
          animation: 'tickerScroll 35s linear infinite'
        }}
      >
        {displayItems.map((item, idx) => (
          <Box
            key={`${item.symbol}-${idx}`}
            sx={{
              fontFamily: '"JetBrains Mono", monospace',
              fontSize: '11px',
              fontWeight: 600,
              display: 'inline-flex',
              gap: '8px',
              alignItems: 'center',
              letterSpacing: '0.5px'
            }}
          >
            <span style={{ color: '#7C7C8A' }}>{item.symbol}</span>
            <span style={{ color: item.isUp ? '#1DB954' : '#E91429' }}>
              ₹{item.price.toLocaleString('en-IN', { minimumFractionDigits: 2 })} {item.isUp ? '▲' : '▼'}{item.change}
            </span>
          </Box>
        ))}
      </Box>
    </Box>
  );
};
