import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import AuthPage from "./pages/auth/Index";
import Index from "./pages/home/Index";
import NotFound from "./pages/not-found/Index";
import TournamentHub from "./pages/tournaments/Hub";
import TournamentHome from "./pages/tournaments/Home";
import AdminTournaments from "./pages/admin/tournaments/Index";
import TournamentSection from "./pages/tournaments/Section";
import TournamentControl from "./pages/admin/tournaments/Control";

const queryClient = new QueryClient();

const App = () => (
  <QueryClientProvider client={queryClient}>
    <TooltipProvider>
      <Sonner />
      <BrowserRouter>
        <Routes>
          <Route path="/" element={<Index />} />
          <Route path="/auth" element={<AuthPage />} />
          <Route path="/tournaments" element={<TournamentHub />} />
          <Route path="/tournaments/:slug" element={<TournamentHome />} />
          <Route path="/tournaments/:slug/:section" element={<TournamentSection />} />
          <Route path="/admin/tournaments" element={<AdminTournaments />} />
          <Route path="/admin/tournaments/:slug/control" element={<TournamentControl />} />
          <Route path="*" element={<NotFound />} />
        </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </QueryClientProvider>
);

export default App;
