import { Check, Coins, LockKeyhole, ShoppingBag, Sparkles, X } from "lucide-react";
import { useId, useMemo, useState } from "react";
import {
  HEAD_ACCESSORY_CATALOG,
  HELD_ITEM_CATALOG,
  type CosmeticRarity,
  type EquipmentSelection,
  type HeadAccessoryId,
  type HeldItemId,
} from "@type-battle/shared";
import type { CosmeticProgress } from "../../lib/cosmetic-progress";
import { DialogOverlay } from "./dialog-overlay";
import { StickFigure } from "./stick-figure";
import { Button } from "./ui";

type CosmeticChoice =
  | {
      slot: "head";
      id: HeadAccessoryId;
      name: string;
      price: number;
      rarity: CosmeticRarity;
    }
  | {
      slot: "held";
      id: HeldItemId;
      name: string;
      price: number;
      rarity: CosmeticRarity;
    };

type PurchaseResult = "purchased" | "already-owned" | "insufficient-coins";

type CosmeticCustomizationModalProps = {
  initialView: "shop" | "equipment";
  progress: CosmeticProgress;
  onPurchase: (selection: CosmeticChoice) => PurchaseResult;
  onEquip: (equipment: EquipmentSelection) => void;
  onClose: () => void;
};

const catalog: readonly CosmeticChoice[] = [
  ...HEAD_ACCESSORY_CATALOG,
  ...HELD_ITEM_CATALOG,
];

const RARITY_LABELS: Record<CosmeticRarity, string> = {
  normal: "ノーマル",
  rare: "レア",
  epic: "エピック",
  legendary: "レジェンド",
};

export function CosmeticCustomizationModal({
  initialView,
  progress,
  onPurchase,
  onEquip,
  onClose,
}: CosmeticCustomizationModalProps) {
  const titleId = useId();
  const [view, setView] = useState(initialView);
  const [slot, setSlot] = useState<"head" | "held">("head");
  const [selected, setSelected] = useState<CosmeticChoice>(
    () => catalog.find((item) => item.slot === "head" && item.id === progress.headAccessoryId)
      ?? catalog[0]!,
  );
  const [confirming, setConfirming] = useState(false);
  const [purchased, setPurchased] = useState<CosmeticChoice | null>(null);
  const [purchaseError, setPurchaseError] = useState("");

  const visibleItems = useMemo(
    () => catalog.filter((item) => item.slot === slot && (
      view === "shop" || isOwned(progress, item)
    )),
    [progress, slot, view],
  );
  const previewEquipment: EquipmentSelection = selected.slot === "head"
    ? { headAccessoryId: selected.id, heldItemId: progress.heldItemId }
    : { headAccessoryId: progress.headAccessoryId, heldItemId: selected.id };
  const selectedOwned = isOwned(progress, selected);
  const selectedEquipped = isEquipped(progress, selected);

  const changeSlot = (nextSlot: "head" | "held") => {
    setSlot(nextSlot);
    setConfirming(false);
    setPurchased(null);
    setPurchaseError("");
    const equippedId = nextSlot === "head" ? progress.headAccessoryId : progress.heldItemId;
    setSelected(catalog.find((item) => item.slot === nextSlot && item.id === equippedId)
      ?? catalog.find((item) => item.slot === nextSlot)!);
  };

  const equip = (item: CosmeticChoice) => {
    onEquip(item.slot === "head"
      ? { headAccessoryId: item.id, heldItemId: progress.heldItemId }
      : { headAccessoryId: progress.headAccessoryId, heldItemId: item.id });
    setPurchased(null);
  };

  const purchase = () => {
    const result = onPurchase(selected);
    setConfirming(false);
    if (result === "purchased") {
      setPurchaseError("");
      setPurchased(selected);
      return;
    }
    setPurchaseError(result === "insufficient-coins"
      ? "スタイルコインが足りません。プレイを完了してコインを集めましょう。"
      : "このコスメはすでに所持しています。");
  };

  return (
    <DialogOverlay className="cosmeticModal" titleId={titleId} onClose={onClose}>
      <div className="modalHeader cosmeticModalHeader">
        <div>
          <p className="eyebrow">CUSTOMIZE</p>
          <h2 id={titleId}>ショップ・装備</h2>
        </div>
        <div className="cosmeticModalHeaderActions">
          <span className="coinBalance" aria-label={`スタイルコイン ${progress.styleCoins}`}>
            <Coins size={17} />
            <strong>{progress.styleCoins}</strong>
            <span>SC</span>
          </span>
          <button className="iconButton" type="button" onClick={onClose} aria-label="ショップと装備を閉じる">
            <X size={20} />
          </button>
        </div>
      </div>

      <div className="cosmeticViewTabs" role="tablist" aria-label="カスタマイズ画面">
        <button
          type="button"
          role="tab"
          aria-selected={view === "shop"}
          className={view === "shop" ? "active" : ""}
          onClick={() => setView("shop")}
        >
          <ShoppingBag size={17} />ショップ
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={view === "equipment"}
          className={view === "equipment" ? "active" : ""}
          onClick={() => setView("equipment")}
        >
          <Sparkles size={17} />装備
        </button>
      </div>

      <div className="cosmeticModalBody">
        <aside className="cosmeticPreview">
          <div className="cosmeticPreviewFigure">
            <StickFigure
              side="left"
              pose="idle"
              status="waiting"
              headAccessoryId={previewEquipment.headAccessoryId}
              heldItemId={previewEquipment.heldItemId}
            />
          </div>
          <p className={`cosmeticRarity rarity-${selected.rarity}`}>
            {RARITY_LABELS[selected.rarity]}
          </p>
          <h3>{selected.name}</h3>
          <p>{selected.slot === "head" ? "頭装備" : "手持ち装備"}</p>
          {view === "shop" && !selectedOwned ? (
            <strong className="cosmeticPrice"><Coins size={16} />{selected.price} SC</strong>
          ) : (
            <span className="ownedBadge"><Check size={15} />所持済み</span>
          )}
          {selectedOwned ? (
            <Button
              variant="primary"
              type="button"
              disabled={selectedEquipped}
              onClick={() => equip(selected)}
            >
              {selectedEquipped ? "装備中" : "装備する"}
            </Button>
          ) : (
            <Button
              variant="primary"
              type="button"
              disabled={selected.price > progress.styleCoins}
              onClick={() => {
                setPurchaseError("");
                setConfirming(true);
              }}
            >
              購入する
            </Button>
          )}
          {purchaseError ? <p className="errorText" role="alert">{purchaseError}</p> : null}
        </aside>

        <section className="cosmeticCatalog" aria-label={view === "shop" ? "ショップの商品" : "所持している装備"}>
          <div className="cosmeticSlotTabs" role="tablist" aria-label="装備枠">
            <button type="button" className={slot === "head" ? "active" : ""} onClick={() => changeSlot("head")}>
              頭装備
            </button>
            <button type="button" className={slot === "held" ? "active" : ""} onClick={() => changeSlot("held")}>
              手持ち装備
            </button>
          </div>
          <div className="cosmeticCatalogGrid">
            {visibleItems.map((item) => {
              const owned = isOwned(progress, item);
              const equipped = isEquipped(progress, item);
              return (
                <button
                  className={`cosmeticCatalogCard rarity-${item.rarity}${selected.slot === item.slot && selected.id === item.id ? " selected" : ""}`}
                  type="button"
                  key={`${item.slot}:${item.id}`}
                  onClick={() => {
                    setSelected(item);
                    setConfirming(false);
                    setPurchased(null);
                    setPurchaseError("");
                  }}
                  aria-pressed={selected.slot === item.slot && selected.id === item.id}
                >
                  <span className="cosmeticCatalogMiniature" aria-hidden="true">
                    <StickFigure
                      side="left"
                      pose="idle"
                      status="waiting"
                      headAccessoryId={item.slot === "head" ? item.id : progress.headAccessoryId}
                      heldItemId={item.slot === "held" ? item.id : progress.heldItemId}
                    />
                  </span>
                  <strong>{item.name}</strong>
                  <small>{equipped ? "装備中" : owned ? "所持済み" : `${item.price} SC`}</small>
                  {!owned ? <LockKeyhole className="cosmeticLock" size={14} /> : null}
                </button>
              );
            })}
          </div>
        </section>
      </div>

      {confirming ? (
        <div className="cosmeticConfirm" role="alertdialog" aria-modal="true" aria-label="購入確認">
          <div>
            <p className="eyebrow">PURCHASE</p>
            <h3>{selected.name}を購入しますか？</h3>
            <p>{selected.price} SCを消費します。残高は{progress.styleCoins - selected.price} SCになります。</p>
            <div className="cosmeticConfirmActions">
              <Button variant="secondary" type="button" onClick={() => setConfirming(false)}>キャンセル</Button>
              <Button variant="primary" type="button" onClick={purchase}>購入する</Button>
            </div>
          </div>
        </div>
      ) : null}

      {purchased ? (
        <div className="cosmeticConfirm" role="status" aria-live="polite">
          <div>
            <p className="eyebrow">UNLOCKED</p>
            <h3>{purchased.name}を入手しました</h3>
            <p>今すぐ装備しますか？ 現在の装備は、選ぶまで維持されます。</p>
            <div className="cosmeticConfirmActions">
              <Button variant="secondary" type="button" onClick={() => setPurchased(null)}>あとで</Button>
              <Button variant="primary" type="button" onClick={() => equip(purchased)}>装備する</Button>
            </div>
          </div>
        </div>
      ) : null}
    </DialogOverlay>
  );
}

function isOwned(progress: CosmeticProgress, item: CosmeticChoice): boolean {
  return item.slot === "head"
    ? progress.ownedHeadAccessoryIds.includes(item.id)
    : progress.ownedHeldItemIds.includes(item.id);
}

function isEquipped(progress: CosmeticProgress, item: CosmeticChoice): boolean {
  return item.slot === "head"
    ? progress.headAccessoryId === item.id
    : progress.heldItemId === item.id;
}
