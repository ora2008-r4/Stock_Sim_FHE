# FHE-based Stock Market Simulation with Private News Events

This project is a unique stock market simulation game powered by **Zama's Fully Homomorphic Encryption (FHE) technology**. It creatively simulates real-market scenarios where players receive FHE-encrypted insider news, allowing them to make informed decisions, thereby enhancing their strategic gameplay and decision-making skills. In this way, players experience a dynamic environment that mirrors true market conditions, all while ensuring the privacy and security of the transmitted information.

## Identifying the Challenge 

In the world of finance, information asymmetry is a significant obstacle. Many players lack access to the same level of insight or data about stock movements and market trends, leading to unbalanced trades and missed opportunities. This simulation addresses the challenge of educational and entertaining engagement in finance by providing random players with insider information, offering them an upper hand that reflects the reality of financial markets. It transforms the often opaque realm of stock trading into a learning tool, preparing players to navigate real-world stock environments.

## The FHE-Centric Solution 

By harnessing **Zama’s Fully Homomorphic Encryption** technology, our project creates a secure ecosystem where sensitive data, such as insider news, can be shared without compromising confidentiality. Using **Zama's open-source libraries**—including **Concrete** and the **zama-fhe SDK**—we facilitate encrypted communications that enable players to act upon information while preserving the privacy of that information during gameplay. 

Through FHE, we not only ensure that messages remain private but also offer a mathematically sound way for players to engage in the financial market simulation without fear of data breaches or exploitation of sensitive information.

## Core Functionalities 

This stock market simulation incorporates a range of features designed to create an engaging user experience:

- **Encrypted Insider News**: Players receive clandestine information, encrypted through FHE, that provides a strategic advantage.
- **Information Asymmetry**: By distributing unique news to select players, the game simulates real-life trading scenarios characterized by information disparity.
- **Educational Financial Gaming**: This game serves as an educational tool, teaching players about market dynamics, decision-making, and risk management.
- **Simulated Stock Market Charts**: Players can view real-time K-line charts that simulate market movements, enhancing the visual appeal and player engagement.

## Technology Stack 

- **Smart Contract**: Developed on Solidity 
- **Blockchain**: Ethereum
- **FHE Libraries**: Zama’s **Concrete** and **zama-fhe SDK**
- **Frontend**: JavaScript, HTML, CSS (with frameworks like React)
- **Development Environment**: Node.js and Hardhat

## Directory Structure 

Here is the file structure of the project:

```
Stock_Sim_FHE/
├── contracts/
│   └── Stock_Sim_FHE.sol
├── scripts/
│   └── deploy.js
├── test/
│   └── StockSim.test.js
├── frontend/
│   ├── index.html
│   ├── styles.css
│   └── app.js
├── package.json
└── README.md
```

## Installation Guide 

Before setting up the project, ensure you have the following installed on your machine:

- **Node.js**: Make sure Node.js is installed, as it is required for running the JavaScript environment.
- **Hardhat or Foundry**: These are necessary for Ethereum smart contract deployment and testing.

To set up the project, follow these steps:

1. Download the project files to your local machine.
2. Open your terminal.
3. Navigate to the project directory.
4. Run the command below to install the required dependencies, including Zama FHE libraries:

   ```bash
   npm install
   ```

**Note**: Do not attempt to use `git clone` or any URLs for installation; follow the method outlined here.

## Build & Run Guide 

To compile the smart contracts, you'll need to run:

```bash
npx hardhat compile
```

To execute the tests included in the project, you can use:

```bash
npx hardhat test
```

Finally, to deploy your contracts to a testnet or local blockchain, use:

```bash
npx hardhat run scripts/deploy.js
```

## Acknowledgements 

This project is made possible through the innovative work of the **Zama team**. Their pioneering efforts in developing open-source tools and technologies for confidential computing have enabled us to build a secure and educational blockchain application. Thank you, Zama, for your dedication to enhancing privacy in the digital landscape!
