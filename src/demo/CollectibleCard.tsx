import { useState, ViewTransition } from "react";
import type { Collectible } from "./collectibles.ts";
import { BuyButton } from "./BuyButton.tsx";

export function CardImage({
  item,
  eager = false,
  shared = false,
  hidden = false,
}: {
  item: Collectible;
  eager?: boolean;
  shared?: boolean;
  hidden?: boolean;
}) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const available = item.image_url && !failed;
  const image = (
    <div
      className="card-image"
      data-loaded={loaded}
      style={hidden ? { visibility: "hidden" } : undefined}
    >
      {available ? (
        <>
          {item.lqip_base64 && !loaded ? (
            <img
              className="card-lqip"
              src={`data:image/webp;base64,${item.lqip_base64}`}
              alt=""
              aria-hidden="true"
            />
          ) : null}
          <img
            className={`card-photo${eager ? " is-eager" : ""}`}
            src={item.image_url}
            alt={item.title}
            loading={eager ? "eager" : "lazy"}
            decoding="async"
            onLoad={() => setLoaded(true)}
            onError={() => setFailed(true)}
          />
        </>
      ) : (
        <img
          className="card-placeholder"
          src="/slab-placeholder.svg"
          alt={`${item.subject} — unavailable`}
        />
      )}
    </div>
  );
  return shared ? (
    <ViewTransition
      name={`card-image-${item.id}`}
      share={{ "detail-navigation": "none", default: "card-image-morph" }}
      default="none"
    >
      {image}
    </ViewTransition>
  ) : (
    image
  );
}

type Props = {
  item: Collectible;
  onOpen?: () => void;
  onBuy?: () => void;
  onSell?: () => void;
  owned?: boolean;
  balance?: number;
  ready?: boolean;
  inDetail?: boolean;
};

export function CollectibleCard({
  item,
  onOpen,
  onBuy,
  onSell,
  owned = false,
  balance = 0,
  ready = false,
  inDetail = false,
}: Props) {
  return (
    <article
      className={`collectible-card${inDetail ? " is-detail-active" : ""}`}
      data-item-id={item.id}
      aria-label={item.title}
    >
      <button
        type="button"
        className="card-open"
        aria-label={`View ${item.title}`}
        disabled={!onOpen}
        onClick={onOpen}
      >
        <CardImage key={item.image_url} item={item} shared={!inDetail} hidden={inDetail} />
      </button>
      <h2 className="card-title" title={item.title}>
        {item.subject}
        {item.set_number ? ` #${item.set_number.split("/")[0]}` : ""} · {item.grader} {item.grade}
      </h2>
      <BuyButton
        item={item}
        owned={owned}
        balance={balance}
        ready={ready}
        onBuy={onBuy}
        onSell={onSell}
      />
    </article>
  );
}
