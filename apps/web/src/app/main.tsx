import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { StrictMode } from "react";
import { createRoot } from "react-dom/client";
import { BrowserRouter } from "react-router-dom";
import "../index.css";
import { RangeProvider } from "../kernel/range.js";
import { App } from "./App.js";

const qc = new QueryClient({ defaultOptions: { queries: { retry: 1, refetchOnWindowFocus: false } } });
createRoot(document.getElementById("root")!).render(
  <StrictMode><QueryClientProvider client={qc}><RangeProvider><BrowserRouter><App /></BrowserRouter></RangeProvider></QueryClientProvider></StrictMode>,
);
