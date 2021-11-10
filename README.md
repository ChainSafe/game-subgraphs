## Game SDK subgraphs

This repo makes use of OpenZeppelin's subgraph generator. This allows you to specify a module and it then generates a subgraph query based on that.

Once the config is created, use the following command, inserting the name of the config

```bash
npx graph-compiler   --config config/<configname>.json   --include node_modules/@openzeppelin/subgraphs/src/datasources   --export-schema   --export-subgraph
```

Then, after creating a subgraph on The Graphs app, follow the auth, build and deploy processes 



## Deployments


### Hosted
#### Rinkeby-ERC 721

Queries (HTTP):     https://api.thegraph.com/subgraphs/name/ryry79261/rinkeby-erc721
Subscriptions (WS): wss://api.thegraph.com/subgraphs/name/ryry79261/rinkeby-erc721

#### Goerli-ERC 721

Queries (HTTP):     https://api.thegraph.com/subgraphs/name/ryry79261/goerli-erc721
Subscriptions (WS): wss://api.thegraph.com/subgraphs/name/ryry79261/goerli-erc721

#### Rinkeby-ERC 721 & 1155

Queries (HTTP):     https://api.thegraph.com/subgraphs/name/ryry79261/rinkeby-erc721-erc1155
Subscriptions (WS): wss://api.thegraph.com/subgraphs/name/ryry79261/rinkeby-erc721-erc1155