import axios from 'axios';

const api = axios.create({
    baseURL: import.meta.env.VITE_API_URL || '/api',
});

// Attach JWT token to requests if present in localStorage
api.interceptors.request.use((config) => {
    const token = localStorage.getItem('quant_token');
    if (token) {
        config.headers.Authorization = `Bearer ${token}`;
    }
    return config;
}, (error) => Promise.reject(error));

export interface UserResponse {
    id: string;
    name: string;
    email: string;
}

export interface TokenResponse {
    access_token: string;
    token_type: string;
    user: UserResponse;
}

export interface UserCreate {
    name: string;
    email: string;
    password: string;
}

export interface UserLogin {
    email: string;
    password: string;
}

export const registerUser = async (data: UserCreate): Promise<TokenResponse> => {
    const response = await api.post<TokenResponse>('/auth/register', data);
    return response.data;
};

export const loginUser = async (data: UserLogin): Promise<TokenResponse> => {
    const response = await api.post<TokenResponse>('/auth/login', data);
    return response.data;
};

export const getMe = async (): Promise<UserResponse> => {
    const response = await api.get<UserResponse>('/auth/me');
    return response.data;
};

export interface Position {
    ticker: string;
    quantity: number;
    average_price: number;
    current_price: number;
    pnl: number;
    stop_loss_price?: number;
    peak_price?: number;            // Highest price reached while holding
    trailing_stop_price?: number;   // 2×ATR14 below peak — bot exits if live price drops here
}

export interface PortfolioSummary {
    cash: number;
    equity: number;
    total_value: number;
    todays_pnl?: number;
    positions: Position[];
}

export const getPortfolio = async (): Promise<PortfolioSummary> => {
    const response = await api.get<PortfolioSummary>('/portfolio');
    return response.data;
};


export interface TradeRequest {
    ticker: string;
    action: "BUY" | "SELL";
    quantity: number;
}

export const executeTrade = async (trade: TradeRequest): Promise<any> => {
    const response = await api.post('/trade', trade);
    return response.data;
};

export const runStrategy = async (ticker: string, quantity: number): Promise<any> => {
    // Pass quantity as query param (safe for numbers)
    const response = await api.post(`/strategy/${ticker}?quantity=${quantity}`);
    return response.data;
};

export interface StockSuggestion {
    symbol: string;
    name: string;
}

export const searchStocks = async (query: string): Promise<StockSuggestion[]> => {
    const response = await api.get<StockSuggestion[]>('/stocks', {
        params: { q: query }
    });
    return response.data;
};

export interface TradeHistoryItem {
    id: string;
    ticker: string;
    action: string;
    quantity: number;
    price: number;
    timestamp: string;
    pnl?: number;
    strategy?: string;
    reason?: string;
}

export interface AnalysisMetrics {
    total_pnl: number;
    win_rate: number;
    total_trades: number;
    profit_factor: number;
    trades: TradeHistoryItem[];
}

export const startAutoTrading = async (): Promise<any> => {
    const response = await api.post('/auto/start');
    return response.data;
};

export const stopAutoTrading = async (): Promise<any> => {
    const response = await api.post('/auto/stop');
    return response.data;
};

export const triggerAutoScan = async (): Promise<any> => {
    const response = await api.post('/auto/scan');
    return response.data;
};

export const getAutoStatus = async (): Promise<{ is_running: boolean }> => {
    const response = await api.get('/auto/status');
    return response.data;
}

export const bookProfit = async (): Promise<{
    status: string;
    message: string;
    sold_positions: any[];
    total_profit_booked: number;
    bot_scan_triggered: boolean;
}> => {
    const response = await api.post('/book-profit');
    return response.data;
};

export const getAnalysis = async (): Promise<AnalysisMetrics> => {
    const response = await api.get<AnalysisMetrics>('/analysis');
    return response.data;
};

export interface BacktestTrade {
    entry_date: string;
    exit_date: string;
    action: string;
    entry_price: number;
    exit_price: number;
    quantity: number;
    pnl: number;
    pnl_pct: number;
    exit_reason: string;
}

export interface EquityCurvePoint {
    date: string;
    equity: number;
    close: number;
}

export interface BacktestResult {
    ticker: string;
    months: number;
    initial_capital: number;
    final_equity: number;
    total_return_pct: number;
    win_rate: number;
    total_trades: number;
    max_drawdown_pct: number;
    sharpe_ratio: number;
    trades: BacktestTrade[];
    equity_curve: EquityCurvePoint[];
}

export const runBacktest = async (ticker: string = 'RELIANCE.NS', months: number = 12): Promise<BacktestResult> => {
    const response = await api.get<BacktestResult>('/backtest', {
        params: { ticker, months }
    });
    return response.data;
};

export default api;
