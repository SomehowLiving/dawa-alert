import { getApi } from "@/lib/deps"

export const GET = (req: Request) => getApi().handle(req)
