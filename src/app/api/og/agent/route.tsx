import { ImageResponse } from "next/og";
import { type NextRequest } from "next/server";

export const runtime = "edge";

export async function GET(req: NextRequest) {
  const { searchParams, origin } = new URL(req.url);

  const name = (searchParams.get("name") || "Untitled Agent").slice(0, 40);
  const slug = (searchParams.get("slug") || "agent").slice(0, 32);
  const category = (searchParams.get("category") || "OTHER").toUpperCase();
  const price = Number(searchParams.get("price") || 0);
  const id = searchParams.get("id") || "A-00";
  const year = searchParams.get("year") || String(new Date().getFullYear());

  const artwork = `${origin}/images/pixelhandshake.png`;
  const logo = `${origin}/images/logo.png`;

  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          alignItems: "center",
          justifyContent: "center",
          gap: 40,
          padding: 60,
          background: "#000",
        }}
      >
        {/* Front */}
        <div
          style={{
            width: 460,
            height: 630,
            borderRadius: 24,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 18,
            background:
              "linear-gradient(155deg,#E8E8EC 0%,#C8C8CC 35%,#D8D8DC 60%,#BFBFC4 100%)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 18,
                color: "#1A1A1E",
                letterSpacing: 3,
                fontWeight: 600,
              }}
            >
              {id}
            </div>
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
              {[16, 5, 20, 5, 16, 5, 20, 5, 16].map((h, i) => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: h,
                    background: "#1A1A1E",
                  }}
                />
              ))}
            </div>
          </div>

          <div
            style={{
              width: "100%",
              height: 380,
              borderRadius: 6,
              display: "flex",
              overflow: "hidden",
              background: "#0A0A0C",
            }}
          >
            <img
              src={artwork}
              alt=""
              width={412}
              height={380}
              style={{ objectFit: "cover", width: "100%", height: "100%" }}
            />
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "flex-end",
              justifyContent: "space-between",
              marginTop: "auto",
            }}
          >
            <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
              <div
                style={{
                  fontFamily: "Georgia, serif",
                  fontSize: 38,
                  color: "#0A0A0C",
                  lineHeight: 1,
                }}
              >
                {name}
              </div>
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  color: "#2A2A2E",
                  letterSpacing: 2,
                  fontWeight: 500,
                }}
              >
                {category} · AGENT
              </div>
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  color: "rgba(26,26,30,0.55)",
                  letterSpacing: 2,
                  marginTop: 4,
                }}
              >
                {slug.slice(0, 8)}
              </div>
            </div>
            <div
              style={{
                display: "flex",
                flexDirection: "column",
                alignItems: "flex-end",
                gap: 8,
              }}
            >
              <div
                style={{
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 11,
                  color: "rgba(26,26,30,0.55)",
                  letterSpacing: 3,
                }}
              >
                {year}
              </div>
              <div
                style={{
                  display: "flex",
                  fontFamily: "ui-monospace, monospace",
                  fontSize: 16,
                  fontWeight: 600,
                  background: "#0A0A0C",
                  color: "#F2F2F4",
                  padding: "10px 14px",
                  borderRadius: 6,
                }}
              >
                ${price.toFixed(2)} / task
              </div>
            </div>
          </div>
        </div>

        {/* Back */}
        <div
          style={{
            width: 460,
            height: 630,
            borderRadius: 24,
            padding: 24,
            display: "flex",
            flexDirection: "column",
            gap: 18,
            background:
              "linear-gradient(155deg,#2C2C30 0%,#1A1A1E 35%,#232326 60%,#141416 100%)",
            boxShadow: "0 20px 50px rgba(0,0,0,0.5)",
          }}
        >
          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div style={{ display: "flex", alignItems: "flex-end", gap: 4 }}>
              {[16, 5, 20, 5, 16, 5, 20, 5, 16].map((h, i) => (
                <div
                  key={i}
                  style={{
                    width: 5,
                    height: h,
                    background: "rgba(230,230,234,0.55)",
                  }}
                />
              ))}
            </div>
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 12,
                color: "rgba(230,230,234,0.45)",
                letterSpacing: 4,
              }}
            >
              CERTIFIED · AGENT
            </div>
          </div>

          <div
            style={{
              flex: 1,
              display: "flex",
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            <div
              style={{
                width: 280,
                height: 280,
                borderRadius: 9999,
                border: "2px solid rgba(230,230,234,0.45)",
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                position: "relative",
              }}
            >
              <img
                src={logo}
                alt=""
                width={170}
                height={170}
                style={{ objectFit: "contain" }}
              />
            </div>
          </div>

          <div
            style={{
              display: "flex",
              flexDirection: "column",
              alignItems: "center",
              gap: 4,
            }}
          >
            <div
              style={{
                fontFamily: "Georgia, serif",
                fontSize: 50,
                color: "#E8E8EC",
                lineHeight: 1,
              }}
            >
              openreap
            </div>
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 11,
                color: "rgba(230,230,234,0.45)",
                letterSpacing: 4,
              }}
            >
              AGENT · MARKETPLACE
            </div>
          </div>

          <div
            style={{
              display: "flex",
              alignItems: "center",
              justifyContent: "space-between",
            }}
          >
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                color: "rgba(230,230,234,0.4)",
                letterSpacing: 3,
              }}
            >
              EST · MMXXVI
            </div>
            <div
              style={{
                fontFamily: "ui-monospace, monospace",
                fontSize: 10,
                color: "rgba(230,230,234,0.4)",
                letterSpacing: 2,
              }}
            >
              openreap.io
            </div>
          </div>
        </div>
      </div>
    ),
    {
      width: 1200,
      height: 630,
    }
  );
}
