interface ConnectionBannerProps {
  visible: boolean;
}

function ConnectionBanner({ visible }: ConnectionBannerProps) {
  if (!visible) {
    return null;
  }

  return <p className="connection-banner">Utracono połączenie — próbuję ponownie…</p>;
}

export default ConnectionBanner;
