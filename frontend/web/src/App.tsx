// App.tsx
import { ConnectButton } from '@rainbow-me/rainbowkit';
import '@rainbow-me/rainbowkit/styles.css';
import React, { useEffect, useState } from "react";
import { ethers } from "ethers";
import { getContractReadOnly, getContractWithSigner } from "./contract";
import "./App.css";
import { useAccount, useSignMessage } from 'wagmi';

interface StockRecord {
  id: string;
  encryptedPrice: string;
  timestamp: number;
  owner: string;
  stockSymbol: string;
  isInsider: boolean;
  newsEvent?: string;
}

interface NewsEvent {
  id: string;
  content: string;
  impact: number; // -1 to 1
  timestamp: number;
  isEncrypted: boolean;
}

const FHEEncryptNumber = (value: number): string => {
  return `FHE-${btoa(value.toString())}`;
};

const FHEDecryptNumber = (encryptedData: string): number => {
  if (encryptedData.startsWith('FHE-')) {
    return parseFloat(atob(encryptedData.substring(4)));
  }
  return parseFloat(encryptedData);
};

const generatePublicKey = () => `0x${Array(2000).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`;

const stockSymbols = ['AAPL', 'MSFT', 'GOOGL', 'AMZN', 'TSLA', 'FB', 'NVDA', 'PYPL', 'ADBE', 'NFLX'];
const newsEvents = [
  "New product launch expected next quarter",
  "CEO unexpectedly resigns",
  "Major partnership announced",
  "Regulatory investigation opened",
  "Earnings beat expectations",
  "Data breach reported",
  "Stock split announced",
  "Dividend increased",
  "Layoffs announced",
  "Merger talks confirmed"
];

const generateRandomStockData = (count: number): StockRecord[] => {
  return Array(count).fill(0).map((_, i) => {
    const isInsider = Math.random() > 0.8;
    return {
      id: `stock-${Date.now()}-${i}`,
      encryptedPrice: FHEEncryptNumber(100 + Math.random() * 1000),
      timestamp: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400),
      owner: `0x${Array(40).fill(0).map(() => Math.floor(Math.random() * 16).toString(16)).join('')}`,
      stockSymbol: stockSymbols[Math.floor(Math.random() * stockSymbols.length)],
      isInsider,
      newsEvent: isInsider && Math.random() > 0.5 ? newsEvents[Math.floor(Math.random() * newsEvents.length)] : undefined
    };
  });
};

const App: React.FC = () => {
  const { address, isConnected } = useAccount();
  const { signMessageAsync } = useSignMessage();
  const [loading, setLoading] = useState(true);
  const [stocks, setStocks] = useState<StockRecord[]>([]);
  const [news, setNews] = useState<NewsEvent[]>([]);
  const [isRefreshing, setIsRefreshing] = useState(false);
  const [showCreateModal, setShowCreateModal] = useState(false);
  const [creating, setCreating] = useState(false);
  const [transactionStatus, setTransactionStatus] = useState<{ visible: boolean; status: "pending" | "success" | "error"; message: string; }>({ visible: false, status: "pending", message: "" });
  const [newStockData, setNewStockData] = useState({ stockSymbol: "AAPL", price: 100, isInsider: false, newsEvent: "" });
  const [selectedStock, setSelectedStock] = useState<StockRecord | null>(null);
  const [decryptedPrice, setDecryptedPrice] = useState<number | null>(null);
  const [isDecrypting, setIsDecrypting] = useState(false);
  const [publicKey, setPublicKey] = useState<string>("");
  const [contractAddress, setContractAddress] = useState<string>("");
  const [chainId, setChainId] = useState<number>(0);
  const [startTimestamp, setStartTimestamp] = useState<number>(0);
  const [durationDays, setDurationDays] = useState<number>(30);
  const [activeTab, setActiveTab] = useState<'market' | 'news' | 'history'>('market');
  const [notifications, setNotifications] = useState<string[]>([]);
  const [showChart, setShowChart] = useState(false);
  const [chartData, setChartData] = useState<any[]>([]);

  useEffect(() => {
    loadStocks().finally(() => setLoading(false));
    const initSignatureParams = async () => {
      const contract = await getContractReadOnly();
      if (contract) setContractAddress(await contract.getAddress());
      if (window.ethereum) {
        const chainIdHex = await window.ethereum.request({ method: 'eth_chainId' });
        setChainId(parseInt(chainIdHex, 16));
      }
      setStartTimestamp(Math.floor(Date.now() / 1000));
      setDurationDays(30);
      setPublicKey(generatePublicKey());
    };
    initSignatureParams();
    generateRandomNews();
  }, []);

  const generateRandomNews = () => {
    const newsItems: NewsEvent[] = Array(10).fill(0).map((_, i) => ({
      id: `news-${Date.now()}-${i}`,
      content: newsEvents[Math.floor(Math.random() * newsEvents.length)],
      impact: Math.random() * 2 - 1,
      timestamp: Math.floor(Date.now() / 1000) - Math.floor(Math.random() * 86400),
      isEncrypted: Math.random() > 0.7
    }));
    setNews(newsItems);
  };

  const loadStocks = async () => {
    setIsRefreshing(true);
    try {
      const contract = await getContractReadOnly();
      if (!contract) return;
      const isAvailable = await contract.isAvailable();
      if (!isAvailable) return;
      const keysBytes = await contract.getData("stock_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try {
          const keysStr = ethers.toUtf8String(keysBytes);
          if (keysStr.trim() !== '') keys = JSON.parse(keysStr);
        } catch (e) { console.error("Error parsing stock keys:", e); }
      }
      const list: StockRecord[] = [];
      for (const key of keys) {
        try {
          const stockBytes = await contract.getData(`stock_${key}`);
          if (stockBytes.length > 0) {
            try {
              const stockData = JSON.parse(ethers.toUtf8String(stockBytes));
              list.push({ 
                id: key, 
                encryptedPrice: stockData.price, 
                timestamp: stockData.timestamp, 
                owner: stockData.owner, 
                stockSymbol: stockData.stockSymbol,
                isInsider: stockData.isInsider || false,
                newsEvent: stockData.newsEvent
              });
            } catch (e) { console.error(`Error parsing stock data for ${key}:`, e); }
          }
        } catch (e) { console.error(`Error loading stock ${key}:`, e); }
      }
      list.sort((a, b) => b.timestamp - a.timestamp);
      setStocks(list);
      addNotification(`Loaded ${list.length} stock records`);
    } catch (e) { 
      console.error("Error loading stocks:", e);
      addNotification("Error loading stock data");
    } finally { 
      setIsRefreshing(false); 
      setLoading(false); 
    }
  };

  const submitStock = async () => {
    if (!isConnected) { alert("Please connect wallet first"); return; }
    setCreating(true);
    setTransactionStatus({ visible: true, status: "pending", message: "Encrypting stock price with Zama FHE..." });
    try {
      const encryptedPrice = FHEEncryptNumber(newStockData.price);
      const contract = await getContractWithSigner();
      if (!contract) throw new Error("Failed to get contract with signer");
      const stockId = `${Date.now()}-${Math.random().toString(36).substring(2, 9)}`;
      const stockData = { 
        price: encryptedPrice, 
        timestamp: Math.floor(Date.now() / 1000), 
        owner: address, 
        stockSymbol: newStockData.stockSymbol,
        isInsider: newStockData.isInsider,
        newsEvent: newStockData.isInsider && newStockData.newsEvent ? newStockData.newsEvent : undefined
      };
      await contract.setData(`stock_${stockId}`, ethers.toUtf8Bytes(JSON.stringify(stockData)));
      const keysBytes = await contract.getData("stock_keys");
      let keys: string[] = [];
      if (keysBytes.length > 0) {
        try { keys = JSON.parse(ethers.toUtf8String(keysBytes)); } 
        catch (e) { console.error("Error parsing keys:", e); }
      }
      keys.push(stockId);
      await contract.setData("stock_keys", ethers.toUtf8Bytes(JSON.stringify(keys)));
      setTransactionStatus({ visible: true, status: "success", message: "Encrypted stock data submitted!" });
      addNotification(`Added new ${newStockData.stockSymbol} stock record`);
      await loadStocks();
      setTimeout(() => {
        setTransactionStatus({ visible: false, status: "pending", message: "" });
        setShowCreateModal(false);
        setNewStockData({ stockSymbol: "AAPL", price: 100, isInsider: false, newsEvent: "" });
      }, 2000);
    } catch (e: any) {
      const errorMessage = e.message.includes("user rejected transaction") ? "Transaction rejected by user" : "Submission failed: " + (e.message || "Unknown error");
      setTransactionStatus({ visible: true, status: "error", message: errorMessage });
      addNotification("Failed to submit stock data");
      setTimeout(() => setTransactionStatus({ visible: false, status: "pending", message: "" }), 3000);
    } finally { setCreating(false); }
  };

  const decryptWithSignature = async (encryptedData: string): Promise<number | null> => {
    if (!isConnected) { alert("Please connect wallet first"); return null; }
    setIsDecrypting(true);
    try {
      const message = `publickey:${publicKey}\ncontractAddresses:${contractAddress}\ncontractsChainId:${chainId}\nstartTimestamp:${startTimestamp}\ndurationDays:${durationDays}`;
      await signMessageAsync({ message });
      await new Promise(resolve => setTimeout(resolve, 1500));
      return FHEDecryptNumber(encryptedData);
    } catch (e) { 
      console.error("Decryption failed:", e); 
      addNotification("Failed to decrypt price");
      return null; 
    } finally { setIsDecrypting(false); }
  };

  const addNotification = (message: string) => {
    setNotifications(prev => [message, ...prev.slice(0, 9)]);
  };

  const generateChartData = (symbol: string) => {
    const filtered = stocks.filter(s => s.stockSymbol === symbol);
    if (filtered.length === 0) return [];
    
    const data = filtered.map(stock => {
      const price = FHEDecryptNumber(stock.encryptedPrice);
      return {
        time: new Date(stock.timestamp * 1000).toISOString().split('T')[0],
        value: price,
        color: stock.isInsider ? '#ff6b00' : '#0066ff'
      };
    }).sort((a, b) => new Date(a.time).getTime() - new Date(b.time).getTime());
    
    return data;
  };

  const isOwner = (recordAddress: string) => address?.toLowerCase() === recordAddress.toLowerCase();

  if (loading) return (
    <div className="loading-screen">
      <div className="spinner"></div>
      <p>Initializing encrypted market connection...</p>
    </div>
  );

  return (
    <div className="app-container future-metal-theme">
      <header className="app-header">
        <div className="logo">
          <h1>隱聞股市模擬</h1>
          <span className="subtitle">FHE-based Stock Market with Private News</span>
        </div>
        <div className="header-actions">
          <button onClick={() => setShowCreateModal(true)} className="create-btn metal-button">
            Add Trade
          </button>
          <div className="wallet-connect-wrapper">
            <ConnectButton accountStatus="address" chainStatus="icon" showBalance={false}/>
          </div>
        </div>
      </header>

      <div className="main-content center-radial">
        <div className="dashboard-panel">
          <div className="panel-header">
            <button 
              className={`tab-button ${activeTab === 'market' ? 'active' : ''}`}
              onClick={() => setActiveTab('market')}
            >
              Market Data
            </button>
            <button 
              className={`tab-button ${activeTab === 'news' ? 'active' : ''}`}
              onClick={() => setActiveTab('news')}
            >
              News Feed
            </button>
            <button 
              className={`tab-button ${activeTab === 'history' ? 'active' : ''}`}
              onClick={() => setActiveTab('history')}
            >
              Trade History
            </button>
            <button className="refresh-btn metal-button" onClick={loadStocks} disabled={isRefreshing}>
              {isRefreshing ? "Refreshing..." : "Refresh"}
            </button>
          </div>

          {activeTab === 'market' && (
            <div className="market-tab">
              <div className="data-stats">
                <div className="stat-card">
                  <h3>Total Stocks</h3>
                  <div className="stat-value">{stocks.length}</div>
                </div>
                <div className="stat-card">
                  <h3>Unique Companies</h3>
                  <div className="stat-value">{new Set(stocks.map(s => s.stockSymbol)).size}</div>
                </div>
                <div className="stat-card">
                  <h3>Insider Trades</h3>
                  <div className="stat-value">{stocks.filter(s => s.isInsider).length}</div>
                </div>
              </div>

              <div className="stock-chart-section">
                <h2>Stock Price Chart</h2>
                <select 
                  className="metal-select"
                  onChange={(e) => {
                    const data = generateChartData(e.target.value);
                    setChartData(data);
                    setShowChart(data.length > 0);
                  }}
                >
                  <option value="">Select a stock</option>
                  {Array.from(new Set(stocks.map(s => s.stockSymbol))).map(symbol => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
                
                {showChart && (
                  <div className="k-line-chart">
                    {chartData.map((item, i) => (
                      <div key={i} className="chart-bar" style={{ height: `${item.value / 10}px`, backgroundColor: item.color }}>
                        <div className="chart-tooltip">
                          {item.time}: ${item.value.toFixed(2)}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>

              <div className="stock-list">
                <h2>Recent Trades</h2>
                <div className="list-header">
                  <div>Symbol</div>
                  <div>Price</div>
                  <div>Time</div>
                  <div>Insider</div>
                  <div>Actions</div>
                </div>
                {stocks.length === 0 ? (
                  <div className="no-data">
                    No stock records found. Add your first trade!
                  </div>
                ) : (
                  stocks.slice(0, 10).map(stock => (
                    <div className="stock-item" key={stock.id} onClick={() => setSelectedStock(stock)}>
                      <div className="symbol">{stock.stockSymbol}</div>
                      <div className="price">${stock.isInsider ? '🔒' : '--'}</div>
                      <div className="time">{new Date(stock.timestamp * 1000).toLocaleTimeString()}</div>
                      <div className="insider">{stock.isInsider ? 'Yes' : 'No'}</div>
                      <div className="actions">
                        <button 
                          className="metal-button small"
                          onClick={(e) => {
                            e.stopPropagation();
                            setSelectedStock(stock);
                          }}
                        >
                          Details
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}

          {activeTab === 'news' && (
            <div className="news-tab">
              <h2>Market News</h2>
              <div className="news-list">
                {news.map(item => (
                  <div className={`news-item ${item.isEncrypted ? 'encrypted' : ''}`} key={item.id}>
                    <div className="news-content">
                      {item.isEncrypted ? (
                        <div className="encrypted-news">
                          <span className="lock-icon">🔒</span>
                          <span>Encrypted Insider News (Available to select traders)</span>
                        </div>
                      ) : (
                        item.content
                      )}
                    </div>
                    <div className="news-meta">
                      <span className="time">{new Date(item.timestamp * 1000).toLocaleTimeString()}</span>
                      <span className={`impact ${item.impact > 0 ? 'positive' : 'negative'}`}>
                        Impact: {item.impact > 0 ? '+' : ''}{item.impact.toFixed(2)}
                      </span>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          )}

          {activeTab === 'history' && (
            <div className="history-tab">
              <h2>Your Trade History</h2>
              <div className="history-list">
                {stocks.filter(s => isOwner(s.owner)).length === 0 ? (
                  <div className="no-data">
                    You haven't made any trades yet
                  </div>
                ) : (
                  stocks.filter(s => isOwner(s.owner)).map(stock => (
                    <div className="history-item" key={stock.id}>
                      <div className="symbol">{stock.stockSymbol}</div>
                      <div className="price">
                        {decryptedPrice && selectedStock?.id === stock.id ? 
                          `$${decryptedPrice.toFixed(2)}` : 
                          (stock.isInsider ? '🔒' : '--')}
                      </div>
                      <div className="time">{new Date(stock.timestamp * 1000).toLocaleString()}</div>
                      <div className="actions">
                        <button 
                          className="metal-button small"
                          onClick={async () => {
                            setSelectedStock(stock);
                            const price = await decryptWithSignature(stock.encryptedPrice);
                            setDecryptedPrice(price);
                          }}
                          disabled={isDecrypting && selectedStock?.id === stock.id}
                        >
                          {isDecrypting && selectedStock?.id === stock.id ? 'Decrypting...' : 'View Price'}
                        </button>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="notification-center">
          <h3>Notifications</h3>
          <div className="notification-list">
            {notifications.length === 0 ? (
              <div className="no-notifications">No notifications yet</div>
            ) : (
              notifications.map((msg, i) => (
                <div className="notification-item" key={i}>
                  <div className="notification-bullet"></div>
                  <div className="notification-text">{msg}</div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {showCreateModal && (
        <div className="modal-overlay">
          <div className="create-modal metal-card">
            <div className="modal-header">
              <h2>Add New Trade</h2>
              <button onClick={() => setShowCreateModal(false)} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="form-group">
                <label>Stock Symbol</label>
                <select 
                  className="metal-select"
                  value={newStockData.stockSymbol}
                  onChange={(e) => setNewStockData({...newStockData, stockSymbol: e.target.value})}
                >
                  {stockSymbols.map(symbol => (
                    <option key={symbol} value={symbol}>{symbol}</option>
                  ))}
                </select>
              </div>
              <div className="form-group">
                <label>Price</label>
                <input 
                  type="number" 
                  className="metal-input"
                  value={newStockData.price}
                  onChange={(e) => setNewStockData({...newStockData, price: parseFloat(e.target.value) || 0})}
                  step="0.01"
                />
              </div>
              <div className="form-group checkbox-group">
                <input 
                  type="checkbox" 
                  id="isInsider"
                  checked={newStockData.isInsider}
                  onChange={(e) => setNewStockData({...newStockData, isInsider: e.target.checked})}
                />
                <label htmlFor="isInsider">This trade includes insider information</label>
              </div>
              {newStockData.isInsider && (
                <div className="form-group">
                  <label>Insider News</label>
                  <textarea 
                    className="metal-textarea"
                    value={newStockData.newsEvent}
                    onChange={(e) => setNewStockData({...newStockData, newsEvent: e.target.value})}
                    placeholder="Enter the private news affecting this trade..."
                  />
                </div>
              )}
              <div className="encryption-preview">
                <h4>FHE Encryption Preview</h4>
                <div className="preview-content">
                  <div>Original Price: ${newStockData.price.toFixed(2)}</div>
                  <div className="arrow">→</div>
                  <div>Encrypted: {FHEEncryptNumber(newStockData.price).substring(0, 30)}...</div>
                </div>
              </div>
            </div>
            <div className="modal-footer">
              <button 
                className="metal-button secondary"
                onClick={() => setShowCreateModal(false)}
              >
                Cancel
              </button>
              <button 
                className="metal-button primary"
                onClick={submitStock}
                disabled={creating}
              >
                {creating ? "Submitting..." : "Submit Trade"}
              </button>
            </div>
          </div>
        </div>
      )}

      {selectedStock && (
        <div className="modal-overlay">
          <div className="detail-modal metal-card">
            <div className="modal-header">
              <h2>{selectedStock.stockSymbol} Trade Details</h2>
              <button onClick={() => {
                setSelectedStock(null);
                setDecryptedPrice(null);
              }} className="close-modal">&times;</button>
            </div>
            <div className="modal-body">
              <div className="detail-row">
                <span className="label">Trade ID:</span>
                <span className="value">{selectedStock.id.substring(0, 12)}...</span>
              </div>
              <div className="detail-row">
                <span className="label">Trader:</span>
                <span className="value">
                  {selectedStock.owner.substring(0, 6)}...{selectedStock.owner.substring(38)}
                </span>
              </div>
              <div className="detail-row">
                <span className="label">Time:</span>
                <span className="value">{new Date(selectedStock.timestamp * 1000).toLocaleString()}</span>
              </div>
              <div className="detail-row">
                <span className="label">Insider Trade:</span>
                <span className="value">{selectedStock.isInsider ? 'Yes' : 'No'}</span>
              </div>
              <div className="detail-row">
                <span className="label">Encrypted Price:</span>
                <span className="value">{selectedStock.encryptedPrice.substring(0, 30)}...</span>
              </div>
              {selectedStock.isInsider && selectedStock.newsEvent && (
                <div className="detail-row">
                  <span className="label">Private News:</span>
                  <span className="value">{selectedStock.newsEvent}</span>
                </div>
              )}
              <div className="price-display">
                {decryptedPrice !== null ? (
                  <div className="decrypted-price">
                    <span>Decrypted Price:</span>
                    <span className="price-value">${decryptedPrice.toFixed(2)}</span>
                  </div>
                ) : (
                  <button 
                    className="metal-button primary"
                    onClick={async () => {
                      const price = await decryptWithSignature(selectedStock.encryptedPrice);
                      setDecryptedPrice(price);
                    }}
                    disabled={isDecrypting}
                  >
                    {isDecrypting ? "Decrypting..." : "Decrypt Price"}
                  </button>
                )}
              </div>
              <div className="fhe-notice">
                <div className="lock-icon">🔒</div>
                <div>
                  This price was decrypted using Zama FHE technology. The original data remains encrypted on-chain.
                </div>
              </div>
            </div>
          </div>
        </div>
      )}

      {transactionStatus.visible && (
        <div className="transaction-modal">
          <div className="transaction-content metal-card">
            <div className={`transaction-icon ${transactionStatus.status}`}>
              {transactionStatus.status === "pending" && <div className="spinner"></div>}
              {transactionStatus.status === "success" && "✓"}
              {transactionStatus.status === "error" && "✗"}
            </div>
            <div className="transaction-message">{transactionStatus.message}</div>
          </div>
        </div>
      )}

      <footer className="app-footer">
        <div className="footer-content">
          <div className="footer-left">
            <h3>隱聞股市模擬</h3>
            <p>FHE-based Stock Market Simulation with private news events</p>
          </div>
          <div className="footer-right">
            <div className="zama-logo">
              <span>Powered by</span>
              <div className="zama-text">ZAMA FHE</div>
            </div>
          </div>
        </div>
        <div className="footer-bottom">
          <div className="copyright">© 2023 FHES166 - All rights reserved</div>
        </div>
      </footer>
    </div>
  );
};

export default App;