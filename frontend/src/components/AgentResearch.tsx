import React, { useState, useEffect } from 'react';
import {
    Box, Typography, Button, TextField, Chip, CircularProgress,
    Accordion, AccordionSummary, AccordionDetails, Alert, Paper,
    Divider, Collapse
} from '@mui/material';
import ExpandMoreIcon from '@mui/icons-material/ExpandMore';
import AutoAwesomeIcon from '@mui/icons-material/AutoAwesome';
import PsychofogyIcon from '@mui/icons-material/Psychology';
import HistoryIcon from '@mui/icons-material/History';
import CodeIcon from '@mui/icons-material/Code';
import VisibilityIcon from '@mui/icons-material/Visibility';
import VisibilityOffIcon from '@mui/icons-material/VisibilityOff';
import { runAgentResearch, getAgentResearchHistory, type AgentResearchResponse, type AgentResearchStep } from '../api';

// --- ISSUE 1 FIX: TOOL NAME MAPPING DICTIONARY ---
export const TOOL_DISPLAY_NAMES: Record<string, string> = {
    get_price: "Price Data",
    compute_indicators: "Technical Indicators",
    get_momentum_score: "Momentum Ranking",
    get_recent_news: "Recent News",
    run_backtest: "Backtest Results",
};

// --- ISSUE 1 FIX: TICKER TO HUMAN-READABLE COMPANY NAME MAPPING ---
export const TICKER_DISPLAY_NAMES: Record<string, string> = {
    "RELIANCE.NS": "Reliance Industries",
    "TCS.NS": "Tata Consultancy Services",
    "INFY.NS": "Infosys",
    "HDFCBANK.NS": "HDFC Bank",
    "ICICIBANK.NS": "ICICI Bank",
    "HINDUNILVR.NS": "Hindustan Unilever",
    "SBIN.NS": "State Bank of India",
    "BHARTIARTL.NS": "Bharti Airtel",
    "ITC.NS": "ITC Limited",
    "KOTAKBANK.NS": "Kotak Mahindra Bank",
    "LT.NS": "L&T",
    "AXISBANK.NS": "Axis Bank",
    "MARUTI.NS": "Maruti Suzuki",
    "ULTRACEMCO.NS": "UltraTech Cement",
    "ASIANPAINT.NS": "Asian Paints",
    "SUNPHARMA.NS": "Sun Pharma",
    "TITAN.NS": "Titan Company",
    "HCLTECH.NS": "HCL Technologies",
    "BAJFINANCE.NS": "Bajaj Finance",
    "NTPC.NS": "NTPC",
    "POWERGRID.NS": "Power Grid",
    "TATASTEEL.NS": "Tata Steel",
    "ADANIENT.NS": "Adani Enterprises",
    "ADANIPORTS.NS": "Adani Ports",
    "WIPRO.NS": "Wipro",
    "ONGC.NS": "ONGC",
    "JSWSTEEL.NS": "JSW Steel",
    "M&M.NS": "Mahindra & Mahindra",
    "TATAMOTORS.NS": "Tata Motors",
    "SUZLON.NS": "Suzlon Energy",
};

// Helper: Get clean company display name
export const getCompanyDisplayName = (ticker: string): string => {
    const key = (ticker || '').toUpperCase();
    return TICKER_DISPLAY_NAMES[key] || key.replace('.NS', '').replace('.BO', '');
};

// Helper: Get clean tool display label
export const getToolDisplayName = (toolName: string): string => {
    return TOOL_DISPLAY_NAMES[toolName] || toolName;
};

// Helper: Replace internal raw tool names & raw ticker symbols with clean display labels in text prose
export const formatCleanProse = (text: string): string => {
    if (!text) return '';
    let cleaned = text;

    // Replace internal Python function names with user-friendly labels
    Object.entries(TOOL_DISPLAY_NAMES).forEach(([rawTool, cleanTool]) => {
        const regex = new RegExp(`\\b${rawTool}\\b`, 'g');
        cleaned = cleaned.replace(regex, cleanTool);
    });

    // Replace raw ticker symbols with human-readable company names
    Object.entries(TICKER_DISPLAY_NAMES).forEach(([rawTicker, cleanName]) => {
        const symbolOnly = rawTicker.replace('.NS', '');
        const escaped = rawTicker.replace('.', '\\.');
        const regex = new RegExp(`\\b${escaped}\\b`, 'gi');
        cleaned = cleaned.replace(regex, `${cleanName} (${symbolOnly})`);
    });

    return cleaned;
};

const QUICK_TICKERS = [
    { symbol: 'RELIANCE.NS', name: 'Reliance' },
    { symbol: 'TCS.NS', name: 'TCS' },
    { symbol: 'INFY.NS', name: 'Infosys' },
    { symbol: 'HDFCBANK.NS', name: 'HDFC Bank' },
    { symbol: 'TATAMOTORS.NS', name: 'Tata Motors' },
    { symbol: 'SBIN.NS', name: 'State Bank' },
];

const LOADING_STATUSES = [
    "🤖 Agent initializing reasoning loop...",
    "📈 Calling Price Data — fetching current market price...",
    "📊 Calling Technical Indicators — evaluating SMA5/SMA20, RSI, ATR...",
    "🚀 Calling Momentum Ranking — ranking against top 20 peers...",
    "📰 Calling Recent News — fetching live headlines & sentiment...",
    "🧪 Calling Backtest Results — running 12-month historical simulation...",
    "🧠 Synthesizing data & constructing cited reasoning chain...",
];

export const AgentResearch: React.FC = () => {
    const [tickerInput, setTickerInput] = useState<string>('RELIANCE.NS');
    const [loading, setLoading] = useState<boolean>(false);
    const [statusIndex, setStatusIndex] = useState<number>(0);
    const [result, setResult] = useState<AgentResearchResponse | null>(null);
    const [history, setHistory] = useState<AgentResearchResponse[]>([]);
    const [error, setError] = useState<string | null>(null);
    const [expandedStep, setExpandedStep] = useState<number | false>(false);

    // --- ISSUE 2 FIX: COLLAPSED DEFAULT VIEW STATE ---
    const [showFullAnalysis, setShowFullAnalysis] = useState<boolean>(false);

    // Fetch past history on load
    useEffect(() => {
        fetchHistory();
    }, []);

    // Cycle status messages while loading
    useEffect(() => {
        if (!loading) return;
        const interval = setInterval(() => {
            setStatusIndex((prev) => (prev + 1) % LOADING_STATUSES.length);
        }, 3500);
        return () => clearInterval(interval);
    }, [loading]);

    const fetchHistory = async () => {
        try {
            const data = await getAgentResearchHistory();
            setHistory(data);
        } catch (e) {
            console.error("Failed to load research history", e);
        }
    };

    const handleRunResearch = async (targetTicker?: string) => {
        const symbol = (targetTicker || tickerInput).trim().toUpperCase();
        if (!symbol) return;

        const formattedSymbol = symbol.endsWith('.NS') || symbol.endsWith('.BO') ? symbol : `${symbol}.NS`;
        setTickerInput(formattedSymbol);
        setLoading(true);
        setError(null);
        setStatusIndex(0);
        setShowFullAnalysis(false); // Reset collapsed state on new research

        try {
            const res = await runAgentResearch(formattedSymbol);
            setResult(res);
            fetchHistory();
        } catch (err: any) {
            console.error("Agent Research Error:", err);
            const msg = err.response?.data?.detail || err.message || "Failed to execute agent research";
            setError(msg);
        } finally {
            setLoading(false);
        }
    };

    const getRecBadgeStyle = (rec: string) => {
        switch (rec?.toUpperCase()) {
            case 'BUY':
                return {
                    bg: 'linear-gradient(135deg, rgba(29,185,84,0.25), rgba(30,215,96,0.15))',
                    border: '1px solid rgba(29,185,84,0.6)',
                    color: '#1DB954',
                    shadow: '0 0 30px rgba(29, 185, 84, 0.3)',
                    emoji: '🚀'
                };
            case 'SELL':
                return {
                    bg: 'linear-gradient(135deg, rgba(239,68,68,0.25), rgba(220,38,38,0.15))',
                    border: '1px solid rgba(239,68,68,0.6)',
                    color: '#ef4444',
                    shadow: '0 0 30px rgba(239, 68, 68, 0.3)',
                    emoji: '🚨'
                };
            default: // HOLD
                return {
                    bg: 'linear-gradient(135deg, rgba(245,158,11,0.25), rgba(217,119,6,0.15))',
                    border: '1px solid rgba(245,158,11,0.6)',
                    color: '#f59e0b',
                    shadow: '0 0 30px rgba(245, 158, 11, 0.3)',
                    emoji: '⚖️'
                };
        }
    };

    const getToolBadgeColor = (toolName: string) => {
        switch (toolName) {
            case 'get_price': return { bg: 'rgba(59,130,246,0.2)', color: '#60a5fa', border: 'rgba(59,130,246,0.4)' };
            case 'compute_indicators': return { bg: 'rgba(6,182,212,0.2)', color: '#22d3ee', border: 'rgba(6,182,212,0.4)' };
            case 'get_momentum_score': return { bg: 'rgba(168,85,247,0.2)', color: '#c084fc', border: 'rgba(168,85,247,0.4)' };
            case 'get_recent_news': return { bg: 'rgba(249,115,22,0.2)', color: '#fb923c', border: 'rgba(249,115,22,0.4)' };
            case 'run_backtest': return { bg: 'rgba(34,197,94,0.2)', color: '#4ade80', border: 'rgba(34,197,94,0.4)' };
            default: return { bg: 'rgba(148,163,184,0.2)', color: '#cbd5e1', border: 'rgba(148,163,184,0.4)' };
        }
    };

    // Extract 1-2 sentence executive summary for the default collapsed view
    const getExecutiveSummary = (fullText: string): string => {
        if (!fullText) return '';
        // If text has explicit **SUMMARY:** section, extract it
        const summaryMatch = fullText.match(/\*\*SUMMARY:\*\*\s*([\s\S]*?)(?=\n\n|\n$|$)/i);
        if (summaryMatch && summaryMatch[1].trim()) {
            return formatCleanProse(summaryMatch[1].trim());
        }
        // Fallback: use first non-header paragraph
        const lines = fullText.split('\n').filter(l => l.trim() && !l.startsWith('**RECOMMENDATION') && !l.startsWith('**CONFIDENCE') && !l.startsWith('**TICKER'));
        if (lines.length > 0) {
            return formatCleanProse(lines[0].replace(/\*\*/g, '').replace(/\[Source:.*?\]/g, ''));
        }
        return formatCleanProse(fullText.slice(0, 200));
    };

    // Helper: Formatted Markdown renderer with clean tool labels and clean company names
    const renderMarkdownSummary = (text: string) => {
        if (!text) return null;
        const paragraphs = text.split('\n\n');

        return paragraphs.map((p, pIdx) => {
            // Check for bold title headers (e.g. **REASONING CHAIN:**)
            if (p.startsWith('**') && p.endsWith('**')) {
                return (
                    <Typography key={pIdx} variant="subtitle1" fontWeight="800" sx={{ color: '#1DB954', mt: 2, mb: 1, fontFamily: '"Outfit", sans-serif' }}>
                        {formatCleanProse(p.replace(/\*\*/g, ''))}
                    </Typography>
                );
            }

            // Replace **text** with bold spans and [Source: xyz] with clean green pills
            const parts = p.split(/(\*\*.*?\*\*|\[Source:.*?\])/g);

            return (
                <Typography key={pIdx} variant="body2" sx={{ color: '#E2E8F0', mb: 1.5, lineHeight: 1.7, fontSize: '14px', fontFamily: '"Outfit", sans-serif' }}>
                    {parts.map((part, i) => {
                        if (part.startsWith('**') && part.endsWith('**')) {
                            return <strong key={i} style={{ color: '#FFFFFF', fontWeight: 700 }}>{formatCleanProse(part.replace(/\*\*/g, ''))}</strong>;
                        }
                        if (part.startsWith('[Source:')) {
                            const rawSource = part.replace('[Source:', '').replace(']', '').trim();
                            const cleanLabel = getToolDisplayName(rawSource);
                            return (
                                <Box
                                    key={i}
                                    component="span"
                                    sx={{
                                        display: 'inline-flex',
                                        alignItems: 'center',
                                        px: 0.8,
                                        py: 0.2,
                                        mx: 0.4,
                                        borderRadius: '4px',
                                        fontSize: '11px',
                                        fontWeight: 700,
                                        bgcolor: 'rgba(29, 185, 84, 0.15)',
                                        border: '1px solid rgba(29, 185, 84, 0.3)',
                                        color: '#1DB954',
                                    }}
                                >
                                    📎 {cleanLabel}
                                </Box>
                            );
                        }
                        return formatCleanProse(part);
                    })}
                </Typography>
            );
        });
    };

    return (
        <Box sx={{ width: '100%', display: 'flex', flexDirection: 'column', gap: 3.5 }}>
            {/* Top Banner Card */}
            <Paper
                elevation={0}
                sx={{
                    p: { xs: 3, sm: 4 },
                    borderRadius: '20px',
                    background: 'linear-gradient(135deg, rgba(18,18,18,0.95), rgba(30,30,30,0.85))',
                    border: '1px solid rgba(255, 255, 255, 0.08)',
                    backdropFilter: 'blur(20px)',
                    position: 'relative',
                    overflow: 'hidden',
                    boxShadow: '0 8px 32px rgba(0, 0, 0, 0.4)'
                }}
            >
                {/* Background Ambient Glow */}
                <Box
                    sx={{
                        position: 'absolute',
                        top: -80,
                        right: -80,
                        width: 260,
                        height: 260,
                        borderRadius: '50%',
                        background: 'radial-gradient(circle, rgba(29,185,84,0.18) 0%, rgba(0,0,0,0) 70%)',
                        pointerEvents: 'none'
                    }}
                />

                <Box display="flex" alignItems="center" gap={1.5} mb={1}>
                    <Box
                        sx={{
                            width: 38,
                            height: 38,
                            borderRadius: '10px',
                            background: 'linear-gradient(135deg, #1DB954, #1ed760)',
                            display: 'flex',
                            alignItems: 'center',
                            justifyContent: 'center',
                            fontSize: '20px',
                            boxShadow: '0 0 20px rgba(29, 185, 84, 0.4)'
                        }}
                    >
                        🧠
                    </Box>
                    <Typography variant="h5" fontWeight="800" sx={{ color: 'white', fontFamily: '"Outfit", sans-serif', letterSpacing: '-0.5px' }}>
                        Autonomous Stock Research Agent
                    </Typography>
                    <Chip
                        icon={<AutoAwesomeIcon sx={{ fontSize: '14px !important', color: '#1DB954 !important' }} />}
                        label="LangChain ReAct · Gemini Flash"
                        sx={{
                            bgcolor: 'rgba(29,185,84,0.12)',
                            color: '#1DB954',
                            border: '1px solid rgba(29,185,84,0.3)',
                            fontWeight: 700,
                            fontSize: '12px',
                            fontFamily: '"Outfit", sans-serif'
                        }}
                    />
                </Box>

                <Typography variant="body2" sx={{ color: '#B3B3B3', mb: 3, maxWidth: '750px', fontFamily: '"Outfit", sans-serif', fontSize: '14px' }}>
                    Type any stock symbol to launch an autonomous multi-step research loop. The agent evaluates price data, technical indicators, relative momentum, headlines, and 12-month backtests to return a cited recommendation.
                </Typography>

                {/* Input & Search Section */}
                <Box display="flex" gap={1.5} flexWrap="wrap" alignItems="center">
                    <TextField
                        variant="outlined"
                        size="small"
                        placeholder="Enter Stock Ticker (e.g. RELIANCE.NS, TCS.NS)"
                        value={tickerInput}
                        onChange={(e) => setTickerInput(e.target.value)}
                        onKeyDown={(e) => e.key === 'Enter' && handleRunResearch()}
                        disabled={loading}
                        sx={{
                            width: { xs: '100%', sm: '360px' },
                            '& .MuiOutlinedInput-root': {
                                bgcolor: 'rgba(0, 0, 0, 0.6)',
                                borderRadius: '12px',
                                color: 'white',
                                fontFamily: '"Outfit", sans-serif',
                                fontSize: '14px',
                                fontWeight: 600,
                                '& fieldset': { borderColor: 'rgba(255, 255, 255, 0.15)' },
                                '&:hover fieldset': { borderColor: '#1DB954' },
                                '&.Mui-focused fieldset': { borderColor: '#1DB954' }
                            }
                        }}
                    />

                    <Button
                        variant="contained"
                        onClick={() => handleRunResearch()}
                        disabled={loading || !tickerInput.trim()}
                        startIcon={loading ? <CircularProgress size={18} sx={{ color: '#000' }} /> : <PsychofogyIcon />}
                        sx={{
                            borderRadius: '12px',
                            px: 3,
                            py: 1,
                            fontWeight: 800,
                            fontSize: '14px',
                            fontFamily: '"Outfit", sans-serif',
                            textTransform: 'none',
                            background: 'linear-gradient(135deg, #1DB954, #1ed760)',
                            color: '#000000',
                            boxShadow: '0 4px 20px rgba(29, 185, 84, 0.35)',
                            '&:hover': { background: '#1ed760' }
                        }}
                    >
                        {loading ? 'Analyzing...' : 'Run Agent Research'}
                    </Button>
                </Box>

                {/* Preset Chips with Clean Display Names */}
                <Box display="flex" alignItems="center" gap={1} mt={2} flexWrap="wrap">
                    <Typography variant="caption" sx={{ color: '#B3B3B3', fontWeight: 600, mr: 0.5 }}>
                        Quick Select:
                    </Typography>
                    {QUICK_TICKERS.map((stock) => (
                        <Chip
                            key={stock.symbol}
                            label={`${stock.name} (${stock.symbol.replace('.NS', '')})`}
                            onClick={() => handleRunResearch(stock.symbol)}
                            disabled={loading}
                            sx={{
                                bgcolor: tickerInput.toUpperCase() === stock.symbol ? 'rgba(29, 185, 84, 0.25)' : 'rgba(255, 255, 255, 0.05)',
                                color: tickerInput.toUpperCase() === stock.symbol ? '#1DB954' : '#FFFFFF',
                                border: '1px solid',
                                borderColor: tickerInput.toUpperCase() === stock.symbol ? 'rgba(29, 185, 84, 0.5)' : 'rgba(255, 255, 255, 0.1)',
                                cursor: 'pointer',
                                fontSize: '12px',
                                fontWeight: 600,
                                fontFamily: '"Outfit", sans-serif',
                                '&:hover': { bgcolor: 'rgba(29, 185, 84, 0.2)', color: '#1DB954' }
                            }}
                        />
                    ))}
                </Box>
            </Paper>

            {/* Error Alert */}
            {error && (
                <Alert severity="error" onClose={() => setError(null)} sx={{ borderRadius: '12px', bgcolor: 'rgba(239,68,68,0.15)', border: '1px solid rgba(239,68,68,0.3)', color: '#fca5a5' }}>
                    {error}
                </Alert>
            )}

            {/* Loading Glass State Card */}
            {loading && (
                <Paper
                    elevation={0}
                    sx={{
                        p: 4,
                        borderRadius: '20px',
                        background: 'linear-gradient(135deg, rgba(18,18,18,0.9), rgba(24,24,24,0.9))',
                        border: '1px solid rgba(29, 185, 84, 0.3)',
                        display: 'flex',
                        flexDirection: 'column',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: 2.5,
                        textAlign: 'center',
                        boxShadow: '0 0 40px rgba(29, 185, 84, 0.15)'
                    }}
                >
                    <CircularProgress size={54} sx={{ color: '#1DB954' }} />
                    <Typography variant="h6" fontWeight="700" sx={{ color: 'white', fontFamily: '"Outfit", sans-serif' }}>
                        Autonomous Agent is Researching {getCompanyDisplayName(tickerInput)} ({tickerInput.replace('.NS', '')})...
                    </Typography>
                    <Typography variant="body2" sx={{ color: '#1DB954', fontWeight: 600, fontFamily: '"Outfit", sans-serif', animation: 'pulse 1.5s infinite' }}>
                        {LOADING_STATUSES[statusIndex]}
                    </Typography>
                    <Typography variant="caption" sx={{ color: '#7C7C8A' }}>
                        This process takes ~15–30 seconds as the agent executes live tool calls and verifies citations.
                    </Typography>
                </Paper>
            )}

            {/* Agent Results Display */}
            {result && !loading && (
                <Box display="flex" flexDirection="column" gap={3}>
                    
                    {/* --- ISSUE 2 FIX: DEFAULT COMPACT HEADER CARD --- */}
                    <Paper
                        elevation={0}
                        sx={{
                            p: { xs: 3, sm: 4 },
                            borderRadius: '20px',
                            background: getRecBadgeStyle(result.recommendation).bg,
                            border: getRecBadgeStyle(result.recommendation).border,
                            boxShadow: getRecBadgeStyle(result.recommendation).shadow,
                            display: 'flex',
                            flexDirection: { xs: 'column', sm: 'row' },
                            alignItems: { xs: 'flex-start', sm: 'center' },
                            justifyContent: 'space-between',
                            gap: 2.5
                        }}
                    >
                        <Box>
                            <Typography variant="caption" sx={{ color: '#B3B3B3', fontWeight: 700, letterSpacing: '1px', textTransform: 'uppercase' }}>
                                RECOMMENDATION FOR {getCompanyDisplayName(result.ticker).toUpperCase()} ({result.ticker})
                            </Typography>
                            <Typography variant="h2" fontWeight="900" sx={{ color: getRecBadgeStyle(result.recommendation).color, fontFamily: '"Outfit", sans-serif', letterSpacing: '-1px', my: 0.5 }}>
                                {getRecBadgeStyle(result.recommendation).emoji} {result.recommendation}
                            </Typography>
                            <Box display="flex" gap={1.5} alignItems="center" mt={1}>
                                <Chip
                                    label={`CONFIDENCE: ${result.confidence}`}
                                    sx={{
                                        bgcolor: 'rgba(255,255,255,0.1)',
                                        color: '#FFFFFF',
                                        fontWeight: 800,
                                        fontSize: '12px',
                                        fontFamily: '"Outfit", sans-serif'
                                    }}
                                />
                                <Typography variant="caption" sx={{ color: '#B3B3B3' }}>
                                    Generated at {new Date(result.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                                </Typography>
                            </Box>
                        </Box>

                        <Box sx={{ textAlign: { xs: 'left', sm: 'right' } }}>
                            <Typography variant="caption" sx={{ color: '#B3B3B3', display: 'block', mb: 0.5 }}>
                                REPORT ID
                            </Typography>
                            <Typography variant="body2" sx={{ color: '#94a3b8', fontFamily: 'monospace', fontSize: '12px' }}>
                                {result.id.slice(0, 8)}...
                            </Typography>
                        </Box>
                    </Paper>

                    {/* --- ISSUE 2 FIX: EXECUTIVE SUMMARY CARD (DEFAULT VIEW) --- */}
                    <Paper
                        elevation={0}
                        sx={{
                            p: { xs: 3, sm: 3.5 },
                            borderRadius: '20px',
                            background: '#121212',
                            border: '1px solid rgba(255, 255, 255, 0.08)',
                        }}
                    >
                        <Typography variant="caption" sx={{ color: '#1DB954', fontWeight: 800, letterSpacing: '1.2px', textTransform: 'uppercase', display: 'block', mb: 1, fontFamily: '"Outfit", sans-serif' }}>
                            💡 EXECUTIVE SUMMARY
                        </Typography>

                        {(!result.summary || result.trace.length === 0) ? (
                            <Alert severity="warning" sx={{ borderRadius: '12px', bgcolor: 'rgba(245,158,11,0.15)', color: '#fcd34d', border: '1px solid rgba(245,158,11,0.3)', fontFamily: '"Outfit", sans-serif' }}>
                                ⚠️ Google Gemini Free-Tier API Rate Limit was reached. Please wait 20 seconds and click <strong>Run Agent Research</strong> again.
                            </Alert>
                        ) : (
                            <Typography variant="body1" sx={{ color: '#F1F5F9', fontWeight: 500, lineHeight: 1.7, fontSize: '15px', fontFamily: '"Outfit", sans-serif', mb: 2 }}>
                                {getExecutiveSummary(result.summary)}
                            </Typography>
                        )}

                        <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.06)', my: 2 }} />

                        {/* Expandable Section Toggle Button */}
                        <Box display="flex" justifyContent="center">
                            <Button
                                onClick={() => setShowFullAnalysis(!showFullAnalysis)}
                                startIcon={showFullAnalysis ? <VisibilityOffIcon /> : <VisibilityIcon />}
                                endIcon={<ExpandMoreIcon sx={{ transform: showFullAnalysis ? 'rotate(180deg)' : 'rotate(0deg)', transition: 'transform 0.25s ease' }} />}
                                sx={{
                                    borderRadius: '50px',
                                    px: 3,
                                    py: 1,
                                    fontWeight: 700,
                                    fontSize: '13px',
                                    fontFamily: '"Outfit", sans-serif',
                                    textTransform: 'none',
                                    color: '#1DB954',
                                    bgcolor: 'rgba(29, 185, 84, 0.1)',
                                    border: '1px solid rgba(29, 185, 84, 0.3)',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        bgcolor: 'rgba(29, 185, 84, 0.2)',
                                        borderColor: '#1DB954',
                                        transform: 'translateY(-1px)'
                                    }
                                }}
                            >
                                {showFullAnalysis ? 'Hide Detailed Analysis & Tool Trace' : 'Why this recommendation? See full analysis'}
                            </Button>
                        </Box>
                    </Paper>

                    {/* --- ISSUE 2 FIX: EXPANDABLE FULL ANALYSIS SECTION --- */}
                    <Collapse in={showFullAnalysis} timeout="auto" unmountOnExit>
                        <Box display="flex" flexDirection="column" gap={3}>
                            
                            {/* Full Cited Reasoning Section */}
                            <Paper
                                elevation={0}
                                sx={{
                                    p: { xs: 3, sm: 4 },
                                    borderRadius: '20px',
                                    background: '#121212',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                }}
                            >
                                <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
                                    <Typography variant="h6" fontWeight="800" sx={{ color: 'white', fontFamily: '"Outfit", sans-serif' }}>
                                        📋 Step-by-Step Cited Reasoning Chain
                                    </Typography>
                                </Box>

                                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', mb: 3 }} />

                                {renderMarkdownSummary(result.summary)}
                            </Paper>

                            {/* Expandable Reasoning Steps Accordion (Timeline) */}
                            <Paper
                                elevation={0}
                                sx={{
                                    p: { xs: 3, sm: 4 },
                                    borderRadius: '20px',
                                    background: '#121212',
                                    border: '1px solid rgba(255, 255, 255, 0.08)',
                                }}
                            >
                                <Box display="flex" alignItems="center" justifyContent="space-between" mb={2}>
                                    <Box display="flex" alignItems="center" gap={1.5}>
                                        <CodeIcon sx={{ color: '#1DB954' }} />
                                        <Typography variant="h6" fontWeight="800" sx={{ color: 'white', fontFamily: '"Outfit", sans-serif' }}>
                                            🔧 Tool Execution Trace ({result.trace.length} Steps)
                                        </Typography>
                                    </Box>
                                    <Typography variant="caption" sx={{ color: '#7C7C8A' }}>
                                        Transparent ReAct Thought → Tool → Observation loop
                                    </Typography>
                                </Box>

                                <Divider sx={{ borderColor: 'rgba(255, 255, 255, 0.08)', mb: 2.5 }} />

                                {result.trace.map((step: AgentResearchStep, index: number) => {
                                    const badge = getToolBadgeColor(step.tool);
                                    const cleanToolLabel = getToolDisplayName(step.tool);
                                    return (
                                        <Accordion
                                            key={index}
                                            expanded={expandedStep === index}
                                            onChange={() => setExpandedStep(expandedStep === index ? false : index)}
                                            sx={{
                                                bgcolor: 'rgba(255, 255, 255, 0.02)',
                                                border: '1px solid rgba(255, 255, 255, 0.06)',
                                                borderRadius: '12px !important',
                                                mb: 1.5,
                                                '&:before': { display: 'none' }
                                            }}
                                        >
                                            <AccordionSummary expandIcon={<ExpandMoreIcon sx={{ color: '#B3B3B3' }} />}>
                                                <Box display="flex" alignItems="center" gap={2} width="100%">
                                                    <Chip
                                                        label={`Step ${step.step_number}`}
                                                        size="small"
                                                        sx={{ bgcolor: 'rgba(255,255,255,0.1)', color: '#FFFFFF', fontWeight: 800, fontSize: '11px' }}
                                                    />
                                                    <Chip
                                                        label={cleanToolLabel}
                                                        size="small"
                                                        sx={{ bgcolor: badge.bg, color: badge.color, border: `1px solid ${badge.border}`, fontWeight: 700, fontSize: '12px' }}
                                                    />
                                                    <Typography variant="caption" sx={{ color: '#B3B3B3', fontFamily: 'monospace', ml: 'auto', mr: 2, display: { xs: 'none', sm: 'block' } }}>
                                                        {formatCleanProse(JSON.stringify(step.arguments))}
                                                    </Typography>
                                                </Box>
                                            </AccordionSummary>
                                            <AccordionDetails sx={{ bgcolor: 'rgba(0, 0, 0, 0.4)', borderRadius: '0 0 12px 12px', p: 2.5 }}>
                                                <Typography variant="caption" sx={{ color: '#1DB954', fontWeight: 700, display: 'block', mb: 1 }}>
                                                    ARGUMENTS:
                                                </Typography>
                                                <Paper sx={{ p: 1.5, bgcolor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', mb: 2 }}>
                                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#e2e8f0', fontSize: '13px' }}>
                                                        {JSON.stringify(step.arguments, null, 2)}
                                                    </Typography>
                                                </Paper>

                                                <Typography variant="caption" sx={{ color: '#1DB954', fontWeight: 700, display: 'block', mb: 1 }}>
                                                    OBSERVATION RESULT:
                                                </Typography>
                                                <Paper sx={{ p: 1.5, bgcolor: '#0a0a0a', border: '1px solid rgba(255,255,255,0.06)', borderRadius: '8px', maxHeight: '250px', overflowY: 'auto' }}>
                                                    <Typography variant="body2" sx={{ fontFamily: 'monospace', color: '#94a3b8', fontSize: '12px', whiteSpace: 'pre-wrap' }}>
                                                        {formatCleanProse(step.result)}
                                                    </Typography>
                                                </Paper>
                                            </AccordionDetails>
                                        </Accordion>
                                    );
                                })}
                            </Paper>
                        </Box>
                    </Collapse>
                </Box>
            )}

            {/* Recent History Table / Cards */}
            {history.length > 0 && (
                <Paper
                    elevation={0}
                    sx={{
                        p: { xs: 3, sm: 4 },
                        borderRadius: '20px',
                        background: '#121212',
                        border: '1px solid rgba(255, 255, 255, 0.08)'
                    }}
                >
                    <Box display="flex" alignItems="center" gap={1.5} mb={2.5}>
                        <HistoryIcon sx={{ color: '#1DB954' }} />
                        <Typography variant="h6" fontWeight="800" sx={{ color: 'white', fontFamily: '"Outfit", sans-serif' }}>
                            Recent Research History
                        </Typography>
                    </Box>

                    <Box display="grid" gridTemplateColumns="repeat(auto-fill, minmax(280px, 1fr))" gap={2}>
                        {history.filter(h => h.summary && h.trace && h.trace.length > 0).slice(0, 6).map((item) => (
                            <Paper
                                key={item.id}
                                onClick={() => {
                                    setResult(item);
                                    setShowFullAnalysis(false);
                                }}
                                sx={{
                                    p: 2.5,
                                    bgcolor: 'rgba(255, 255, 255, 0.02)',
                                    border: '1px solid rgba(255, 255, 255, 0.06)',
                                    borderRadius: '14px',
                                    cursor: 'pointer',
                                    transition: 'all 0.2s ease',
                                    '&:hover': {
                                        borderColor: '#1DB954',
                                        bgcolor: 'rgba(29, 185, 84, 0.05)',
                                        transform: 'translateY(-2px)'
                                    }
                                }}
                            >
                                <Box display="flex" justifyContent="space-between" alignItems="center" mb={1}>
                                    <Typography variant="subtitle1" fontWeight="800" sx={{ color: 'white' }}>
                                        {getCompanyDisplayName(item.ticker)}
                                    </Typography>
                                    <Chip
                                        label={item.recommendation}
                                        size="small"
                                        sx={{
                                            bgcolor: item.recommendation === 'BUY' ? 'rgba(29,185,84,0.2)' : item.recommendation === 'SELL' ? 'rgba(239,68,68,0.2)' : 'rgba(245,158,11,0.2)',
                                            color: item.recommendation === 'BUY' ? '#1DB954' : item.recommendation === 'SELL' ? '#ef4444' : '#f59e0b',
                                            fontWeight: 800,
                                            fontSize: '11px'
                                        }}
                                    />
                                </Box>
                                <Typography variant="caption" sx={{ color: '#7C7C8A', display: 'block' }}>
                                    {new Date(item.timestamp).toLocaleString()} · {item.trace.length} tool calls
                                </Typography>
                            </Paper>
                        ))}
                    </Box>
                </Paper>
            )}
        </Box>
    );
};

export default AgentResearch;
