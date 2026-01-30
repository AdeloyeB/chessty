---                                                                                                                                            
  Step 1: Get an RPC Endpoint (5 minutes)                                                                                                        
                                                                                                                                                 
  Recommended: https://www.alchemy.com/ (free tier is plenty for dev + early production)                                                         
                                                                                                                                                 
  1. Go to https://www.alchemy.com/ → Sign up                                                                                                    
  2. Click "Create App"                                                                                                                          
  3. Select:                                                                                                                                     
    - Chain: Polygon PoS                                                                                                                         
    - Network: Mainnet (or Amoy testnet for testing)                                                                                             
  4. Copy your RPC URL — looks like:                                                                                                             
  https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY                                                                                          
                                                                                                                                                 
  Alternative free options:                                                                                                                      
  ┌────────────────────┬──────────────────────────────┐                                                                                          
  │      Provider      │             URL              │                                                                                          
  ├────────────────────┼──────────────────────────────┤                                                                                          
  │ Public (no signup) │ https://polygon-rpc.com      │                                                                                          
  ├────────────────────┼──────────────────────────────┤                                                                                          
  │ Ankr               │ https://rpc.ankr.com/polygon │                                                                                          
  ├────────────────────┼──────────────────────────────┤                                                                                          
  │ https://infura.io  │ Requires signup              │                                                                                          
  └────────────────────┴──────────────────────────────┘                                                                                          
  ---                                                                                                                                            
  Step 2: Add to Your Environment                                                                                                                
                                                                                                                                                 
  Add to apps/server/.env:                                                                                                                       
                                                                                                                                                 
  # Polygon RPC                                                                                                                                  
  POLYGON_RPC_URL=https://polygon-mainnet.g.alchemy.com/v2/YOUR_API_KEY                                                                          
                                                                                                                                                 
  Add to apps/web/.env.local:                                                                                                                    
                                                                                                                                                 
  # WalletConnect (get from cloud.walletconnect.com)                                                                                             
  NEXT_PUBLIC_WALLETCONNECT_PROJECT_ID=your_project_id                                                                                           
                                                                                                                                                 
  ---                                                                                                                                            
  Step 3: Get a Wallet with MATIC (for gas)                                                                                                      
                                                                                                                                                 
  You need a small amount of MATIC (Polygon's native token) to pay for transaction fees when deploying contracts or settling games.              
                                                                                                                                                 
  1. Create a deployment wallet:                                                                                                                 
    - Use MetaMask or generate one with cast wallet new (Foundry)                                                                                
    - Never use your personal wallet — create a dedicated one for the server                                                                     
  2. Get MATIC:                                                                                                                                  
    - Buy on Coinbase/Binance → withdraw to Polygon network                                                                                      
    - Or bridge from Ethereum using https://portal.polygon.technology/                                                                           
    - You only need ~$5-10 worth for hundreds of transactions                                                                                    
  3. Add private key to server env:                                                                                                              
  # Server wallet for gas (DO NOT COMMIT)                                                                                                        
  SETTLEMENT_SIGNER_PRIVATE_KEY=0x...                                                                                                            
                                                                                                                                                 
  ---                                                                                                                                            
  Step 4: Get USDC Contract Address                                                                                                              
                                                                                                                                                 
  USDC on Polygon is already deployed. You just need the address:                                                                                
                                                                                                                                                 
  Native USDC (Polygon): 0x3c499c542cEF5E3811e1192ce70d8cC03d5c3359                                                                              
  USDC.e (Bridged):      0x2791Bca1f2de4661ED88A30C99A7a9449Aa84174                                                                              
                                                                                                                                                 
  Your app already has this configured in apps/web/src/hooks/useWallet.ts.                                                                       
                                                                                                                                                 
  ---                                                                                                                                            
  Step 5: Deploy Your Contracts (when ready)                                                                                                     
                                                                                                                                                 
  You'll need to write and deploy:                                                                                                               
  - ChessEscrow.sol — holds stakes, settles games                                                                                                
  - GameRegistry.sol — records results                                                                                                           
                                                                                                                                                 
  Tooling options:                                                                                                                               
  ┌─────────────────────────────┬────────────────────────────┐                                                                                   
  │            Tool             │          Best For          │                                                                                   
  ├─────────────────────────────┼────────────────────────────┤                                                                                   
  │ https://book.getfoundry.sh/ │ Fast, Rust-based, modern   │                                                                                   
  ├─────────────────────────────┼────────────────────────────┤                                                                                   
  │ https://hardhat.org/        │ JavaScript, more tutorials │                                                                                   
  └─────────────────────────────┴────────────────────────────┘                                                                                   
  I can help you write these contracts when you're ready.                                                                                        
                                                                                                                                                 
  ---                                                                                                                                            
  Quick Checklist                                                                                                                                
  ┌──────┬───────────────────────────────────────────────┬───────────┐                                                                           
  │ Step │                    Action                     │   Time    │                                                                           
  ├──────┼───────────────────────────────────────────────┼───────────┤                                                                           
  │ 1    │ Sign up for Alchemy, create Polygon app       │ 5 min     │                                                                           
  ├──────┼───────────────────────────────────────────────┼───────────┤                                                                           
  │ 2    │ Add POLYGON_RPC_URL to .env                   │ 1 min     │                                                                           
  ├──────┼───────────────────────────────────────────────┼───────────┤                                                                           
  │ 3    │ Get WalletConnect Project ID                  │ 5 min     │                                                                           
  ├──────┼───────────────────────────────────────────────┼───────────┤                                                                           
  │ 4    │ Create deployment wallet, fund with ~$5 MATIC │ 10 min    │                                                                           
  ├──────┼───────────────────────────────────────────────┼───────────┤                                                                           
  │ 5    │ Write smart contracts                         │ 2-4 hours │                                                                           
  ├──────┼───────────────────────────────────────────────┼───────────┤                                                                           
  │ 6    │ Deploy to testnet, test                       │ 1-2 hours │                                                                           
  ├──────┼───────────────────────────────────────────────┼───────────┤                                                                           
  │ 7    │ Deploy to mainnet                             │ 30 min    │                                                                           
  └──────┴───────────────────────────────────────────────┴───────────┘                                                                           
  ---                                                                                                                                            
  What You're NOT Building                                                                                                                       
                                                                                                                                                 
  Just to be clear:                                                                                                                              
  - ❌ You're not building "a Polygon" (that's the network itself)                                                                               
  - ❌ You're not running a blockchain node                                                                                                      
  - ✅ You're deploying smart contracts TO Polygon                                                                                               
  - ✅ You're using Polygon's infrastructure via RPC                                                                                             
                                                                                                                                                 
  Think of Polygon like AWS — you don't build AWS, you deploy your app to it.                                                                    
                                                                                                                                                 
  ---                                                                                                                                            
  Want me to help you write the smart contracts next? That's the main piece of custom code you need. The escrow logic is straightforward for 1v1 
  chess games.                                                          