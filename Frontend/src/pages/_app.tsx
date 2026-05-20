import type { AppProps } from "next/app";
import "@/src/index.css";
import AppProviders from "@/src/components/layout/AppProviders";

export default function App({ Component, pageProps }: AppProps) {
  return (
    <AppProviders>
      <Component {...pageProps} />
    </AppProviders>
  );
}
