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

## Development

The devcontainer runs as root in `/workspace`, with Git and the product tools
installed during the build. Open it with VS Code or `commander up /absolute/checkout`.
VS Code forwards host Git credentials; Commander supplies the selected session.
Keep secrets and local data outside Git. Use separate worktrees for concurrent work.

## Release

`main` is the integration branch. CI tests and publishes the product image.
Run `make dev` in this repository to deploy its successful build to DEV. After
checking DEV, `make prd` promotes exactly that image digest to PRD. Both use the
same Compose configuration and SSH deployment routine from infrastructure;
server addresses, secrets and data remain separate. Neither stage uses Watchtower.
