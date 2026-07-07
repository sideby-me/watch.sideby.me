import pkg from "../../../package.json";

// Liveness + version contract only. No socket/room/redis logic here — watch is
// frontend-only and holds no server-side real-time state.
export const dynamic = "force-static";

export async function GET() {
  return Response.json({
    status: "ok",
    service: "watch.sideby.me",
    version: pkg.version,
  });
}
