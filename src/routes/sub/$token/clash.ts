import { createFileRoute } from "@tanstack/react-router";
import { subscriptionResponse } from "@/lib/sub-response.server";

export const Route = createFileRoute("/sub/$token/clash")({
  server: {
    handlers: {
      GET: ({ params }) => subscriptionResponse(params.token, "clash"),
    },
  },
});
