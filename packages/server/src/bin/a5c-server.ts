import { createA5cServer } from "../server.js";

async function main() {
  const port = Number(process.env.PORT ?? "3939");
  const srv = createA5cServer();
  const actual = await srv.listen(port);
  // eslint-disable-next-line no-console
  console.log(`a5c-server listening on :${actual}`);
}

main().catch((e) => {
  // eslint-disable-next-line no-console
  console.error(e);
  process.exit(1);
});


