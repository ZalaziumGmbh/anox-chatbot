# ANOXchatbot

Zalazium's AnythingLLM based chatbot. `server/` is the Node API, `collector/`
processes documents and `frontend/` contains the browser UI. The runtime image
is built from `docker/Dockerfile`.

The devcontainer installs Node 22 and the required browser libraries. Its initial
setup installs dependencies and prepares the local environment/database. Start
`yarn dev:server`, `yarn dev:collector` and `yarn dev:frontend` in separate terminals.
Ports 3001 and 3000 are forwarded by the editor. Puppeteer needs its configured
browser capability. Never use a production environment for a local development run.

[Upstream features, configuration and attribution](docs/reference.md).

For isolated verification, CI initializes Prisma and runs the
managed runtime checks, Jest, and the embed and frontend builds. Check sign in
at a narrow viewport in both authentication modes, including a delayed login
response. Use synthetic API replies for this check.

## Development

Open the checkout in VS Code with its devcontainer. It runs as root in
`/workspace` and installs the product tools. Keep local configuration and data
outside Git. See [agent instructions](AGENTS.md) for the project checks.

## Release

`main` is the integration branch. CI tests and publishes the product image.
Run `make dev` in this repository to deploy its successful build to DEV. After
checking DEV, `make prd` promotes exactly that image digest to PRD. Both use the
same Compose configuration and SSH deployment routine from infrastructure;
server addresses, secrets and data remain separate. Neither stage uses Watchtower.
