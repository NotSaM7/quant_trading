import { useState } from 'react';
import { ThemeProvider, createTheme } from '@mui/material';
import Dashboard from './components/Dashboard';
import MainLayout from './components/MainLayout';
import { AuthProvider } from './context/AuthContext';

const darkTheme = createTheme({
  palette: {
    mode: 'dark',
    primary: {
      main: '#1DB954',
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
    fontFamily: '"Outfit", sans-serif',
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
  const [tabIndex, setTabIndex] = useState<number>(0);

  return (
    <ThemeProvider theme={darkTheme}>
      <AuthProvider>
        <MainLayout activeTab={tabIndex} onTabChange={setTabIndex}>
          <Dashboard tabIndex={tabIndex} />
        </MainLayout>
      </AuthProvider>
    </ThemeProvider>
  );
}

export default App;
