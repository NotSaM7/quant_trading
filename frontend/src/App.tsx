import { ThemeProvider, createTheme } from '@mui/material';
import Dashboard from './components/Dashboard';
import Sidebar from './components/Sidebar';
import MainLayout from './components/MainLayout';
import { AuthProvider } from './context/AuthContext';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1DB954', // Spotify Green
    },
    background: {
      default: '#000000',
      paper: '#121212',
    },
    text: {
      primary: '#FFFFFF',
      secondary: '#B3B3B3',
    },
  },
  typography: {
    fontFamily: '"Inter", sans-serif',
    allVariants: {
      color: '#FFFFFF',
    },
  },
  components: {
    MuiPaper: {
      styleOverrides: {
        root: {
          backgroundImage: 'none',
          backgroundColor: '#121212',
        }
      }
    }
  }
});

function App() {
  return (
    <ThemeProvider theme={darkTheme}>
      <AuthProvider>
        <div style={{ display: 'flex', width: '100%', minHeight: '100vh' }}>
          <Sidebar />
          <MainLayout>
            <Dashboard />
          </MainLayout>
        </div>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
