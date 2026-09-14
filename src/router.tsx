import { QueryClient } from "@tanstack/react-query";
import { createRouter } from "@tanstack/react-router";
import { routeTree } from "./routeTree.gen";

export const getRouter = () => {
  const queryClient = new QueryClient();

  const router = createRouter({
    routeTree,
    context: { queryClient },
    scrollRestoration: true,
    // Warm each page's code + data as soon as the user hovers/focuses a link,
    // so clicking feels instant instead of waiting on a lazy chunk.
    defaultPreload: "intent",
    defaultPreloadDelay: 20,
    defaultPreloadStaleTime: 30_000,
    defaultStaleTime: 30_000,
  });

  return router;
};
