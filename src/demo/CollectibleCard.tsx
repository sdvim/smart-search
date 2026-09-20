import { useState } from "react";
import { formatMoney } from "./collectibles.ts";
import type { Collectible } from "./collectibles.ts";

function CardImage({ item }: { item: Collectible }) {
  const [loaded, setLoaded] = useState(false);
  const [failed, setFailed] = useState(false);
  const available = item.image_url && !failed;
  return (
    <div className="card-image" data-loaded={loaded}>
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
            className="card-photo"
            src={item.image_url}
            alt={item.title}
            loading="lazy"
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
}

export function CollectibleCard({ item }: { item: Collectible }) {
  return (
    <article className="collectible-card" aria-label={item.title}>
      <CardImage key={item.image_url} item={item} />
      <h2 title={item.title}>
        {item.subject}
        {item.set_number ? ` #${item.set_number.split("/")[0]}` : ""} · {item.grader} {item.grade}
      </h2>
      {item.listed_value !== undefined ? (
        <button type="button" className="buy-button">
          Buy for {formatMoney(item.listed_value)}
        </button>
      ) : (
        <p className="estimated-value">
          {item.fair_market_value !== undefined
            ? `Est. ${formatMoney(item.fair_market_value)}`
            : "Value unavailable"}
        </p>
      )}
    </article>
  );
}
