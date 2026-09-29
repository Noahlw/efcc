import {
  createRootRoute,
  HeadContent,
  Link,
  Outlet,
  Scripts,
} from "@tanstack/react-router";
import { useEffect } from "react";

export const Route = createRootRoute({ component: Root });

function Root() {
  useEffect(() => {
    document.body.dataset.hydrated = "true";
  }, []);
  return (
    <html lang="en">
      <head>
        <meta charSet="utf-8" />
        <meta name="viewport" content="width=device-width, initial-scale=1" />
        <title>Start proof</title>
        <HeadContent />
      </head>
      <body>
        <nav>
          <Link to="/">Home</Link> <Link to="/about">About</Link>
        </nav>
        <Outlet />
        <Scripts />
      </body>
    </html>
  );
}
