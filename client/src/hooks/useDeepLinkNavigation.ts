import { useEffect, useRef } from 'react';
import { useLocation, useNavigate } from 'react-router';

type DeepLinkNavigation = {
  path: string | null;
  search: string;
};

type YozakuraBridge = {
  onNavigate: (callback: (payload: DeepLinkNavigation) => void) => () => void;
  notifyReady: () => void;
};

declare global {
  interface Window {
    yozakura?: YozakuraBridge;
  }
}

export function useDeepLinkNavigation() {
  const navigate = useNavigate();
  const location = useLocation();
  const locationRef = useRef(location);
  locationRef.current = location;

  useEffect(() => {
    const bridge = window.yozakura;
    if (!bridge) {
      return;
    }

    const unsubscribe = bridge.onNavigate(({ path, search }) => {
      const incoming = new URLSearchParams(search);

      if (path) {
        navigate({ pathname: path, search: incoming.toString() });
        return;
      }

      const current = locationRef.current;
      const merged = new URLSearchParams(current.search);
      incoming.forEach((value, key) => {
        merged.set(key, value);
      });
      navigate({ pathname: current.pathname, search: merged.toString() });
    });

    bridge.notifyReady();

    return unsubscribe;
  }, [navigate]);
}
