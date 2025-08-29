// scripts/rutVin_VinDice.js
// Rút VIN từ hợp đồng VinDiceV2 (chỉ OWNER). KHÔNG cần "type":"module".
// Cách chạy:
//   node scripts/rutVin_VinDice.js 25                      -> rút 25 VIN về ví OWNER
//   node scripts/rutVin_VinDice.js 12.5 0xRecipient...    -> rút 12.5 VIN về địa chỉ chỉ định

(async () => {
  // nạp ethers theo cách tương thích CJS (tránh lỗi "Cannot use import statement...")
  const { ethers } = await import("ethers");

  // ===== CẤU HÌNH =====
  const RPC_URL    = "https://rpc.viction.xyz";
  const PRIVATE_KEY = "0xYOUR_PRIVATE_KEY_HERE"; // ⚠️ thay bằng private key ví OWNER
  const VIN_DICE_ADDRESS = "0x9b8BfcAFa8bCaC35B8EdC7682ec6d60B0d1ED1f2"; // VinDiceV2 mới
  const VIN_DECIMALS = 18;

  // ABI tối thiểu cần dùng
  const VIN_DICE_ABI = [
    "function owner() view returns (address)",
    "function bankroll() view returns (uint256)",
    "function ownerWithdraw(uint256 amount, address to) external"
  ];

  // ===== THAM SỐ DÒNG LỆNH =====
  const amountStr  = process.argv[2] || "10";   // mặc định rút 10 VIN
  const toAddress  = process.argv[3] || null;   // nếu bỏ trống -> rút về ví owner
  const amountWei  = ethers.parseUnits(String(amountStr), VIN_DECIMALS);

  console.log("🔁 Kết nối mạng VIC…");
  const provider = new ethers.JsonRpcProvider(RPC_URL);
  const wallet   = new ethers.Wallet(PRIVATE_KEY, provider);
  const dice     = new ethers.Contract(VIN_DICE_ADDRESS, VIN_DICE_ABI, wallet);

  // Xác thực quyền owner
  const onchainOwner = await dice.owner();
  if (onchainOwner.toLowerCase() !== wallet.address.toLowerCase()) {
    throw new Error(`Ví hiện tại (${wallet.address}) KHÔNG PHẢI owner. Owner on-chain: ${onchainOwner}`);
  }

  const recipient = toAddress || wallet.address;

  // Thông tin pool trước khi rút
  const before = await dice.bankroll();
  console.log(`🏦 Pool trước khi rút: ${ethers.formatUnits(before, VIN_DECIMALS)} VIN`);
  console.log(`🚀 Thực hiện rút ${amountStr} VIN về: ${recipient}`);

  // Fee overrides (ưu tiên EIP-1559, fallback legacy)
  const fee = await provider.getFeeData();
  const overrides = { gasLimit: 200_000n };

  if (fee.maxFeePerGas && fee.maxPriorityFeePerGas) {
    const minPrio = ethers.parseUnits("3",  "gwei");
    const minMax  = ethers.parseUnits("12", "gwei");
    const prio = fee.maxPriorityFeePerGas >= minPrio ? fee.maxPriorityFeePerGas : minPrio;
    let maxFee = fee.maxFeePerGas * 2n + prio;
    if (maxFee < minMax) maxFee = minMax;
    overrides.maxFeePerGas = maxFee;
    overrides.maxPriorityFeePerGas = prio;
  } else {
    const fallbackGP = ethers.parseUnits("8", "gwei");
    overrides.gasPrice = fee.gasPrice ?? fallbackGP;
  }

  try {
    const tx = await dice.ownerWithdraw(amountWei, recipient, overrides);
    console.log("⏳ Đã gửi giao dịch, tx:", tx.hash);
    const rc = await tx.wait();
    console.log("✅ Rút VIN thành công! Tx Hash:", rc.hash);

    const after = await dice.bankroll();
    console.log(`🏦 Pool sau khi rút: ${ethers.formatUnits(after, VIN_DECIMALS)} VIN`);
  } catch (err) {
    console.error("❌ Lỗi khi rút VIN:", err?.reason || err?.message || err);
    process.exit(1);
  }
})().catch((e) => {
  console.error("❌ Lỗi khởi chạy:", e?.message || e);
  process.exit(1);
});
