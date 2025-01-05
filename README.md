# kubefirst-bot

> A GitHub App built with [Probot](https://github.com/probot/probot) that Welcome to the Kubefirst repository under Konstruct! We’ve set up Probot to make contributing to this project a smooth and enjoyable experience.

## Setup

```sh
# Install dependencies
npm install

# Run the bot
npm start
```

## Docker

```sh
# 1. Build container
docker build -t kubefirst-bot .

# 2. Start container
docker run -e APP_ID=<app-id> -e PRIVATE_KEY=<pem-value> kubefirst-bot
```

## Contributing

If you have suggestions for how kubefirst-bot could be improved, or want to report a bug, open an issue! We'd love all and any contributions.

For more, check out the [Contributing Guide](CONTRIBUTING.md).

## License

[ISC](LICENSE) © 2024 Aviral Singh
