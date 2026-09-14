import { Router, type IRouter } from "express";
import { db, organizations, platformAdmins, users } from "@workspace/db";
import { eq } from "drizzle-orm";
import { hashPassword } from "../lib/password-auth";

const router: IRouter = Router();

const OWNER_EMAIL = "seifdyago@gmail.com";
const OWNER_ORG_ID = "finos-platform";
const BOOTSTRAP_SECRET =
  process.env.FINOS_OWNER_BOOTSTRAP_SECRET;

router.post(
  "/auth/owner-bootstrap",
  async (req, res): Promise<void> => {
    try {
      if (!BOOTSTRAP_SECRET) {
        res.status(503).json({
          error: "Owner bootstrap is not configured.",
        });
        return;
      }

      const providedSecret =
        typeof req.headers["x-finos-bootstrap-secret"] ===
        "string"
          ? req.headers["x-finos-bootstrap-secret"]
          : "";

      if (
        !providedSecret ||
        providedSecret !== BOOTSTRAP_SECRET
      ) {
        res.status(401).json({
          error: "Unauthorized.",
        });
        return;
      }

      const password =
        typeof req.body?.password === "string"
          ? req.body.password
          : "";

      if (password.length < 8) {
        res.status(400).json({
          error: "Invalid password.",
        });
        return;
      }

      const {
        hash: passwordHash,
        salt: passwordSalt,
      } = hashPassword(password);

      const result = await db.transaction(
        async (tx) => {
          let organization = (
            await tx
              .select()
              .from(organizations)
              .where(
                eq(
                  organizations.id,
                  OWNER_ORG_ID,
                ),
              )
              .limit(1)
          )[0];

          if (!organization) {
            organization = (
              await tx
                .insert(organizations)
                .values({
                  id: OWNER_ORG_ID,
                  name: "FinOS Platform",
                  domain: "platform.finos.local",
                  initials: "FN",
                  industry:
                    "Financial Technology",
                  companySize: "Platform",
                  status: "active",
                })
                .returning()
            )[0];
          }

          if (!organization) {
            throw new Error(
              "Unable to create platform organization.",
            );
          }

          let user = (
            await tx
              .select()
              .from(users)
              .where(
                eq(users.email, OWNER_EMAIL),
              )
              .limit(1)
          )[0];

          if (!user) {
            user = (
              await tx
                .insert(users)
                .values({
                  organizationId:
                    organization.id,
                  email: OWNER_EMAIL,
                  name: "Seifdyago",
                  role: "platform_owner",
                  passwordHash,
                  passwordSalt,
                  status: "active",
                })
                .returning()
            )[0];
          } else {
            user = (
              await tx
                .update(users)
                .set({
                  organizationId:
                    organization.id,
                  name: "Seifdyago",
                  role: "platform_owner",
                  passwordHash,
                  passwordSalt,
                  status: "active",
                  updatedAt: new Date(),
                })
                .where(eq(users.id, user.id))
                .returning()
            )[0];
          }

          if (!user) {
            throw new Error(
              "Unable to create/update owner.",
            );
          }

          const admin = (
            await tx
              .select()
              .from(platformAdmins)
              .where(
                eq(
                  platformAdmins.userId,
                  user.email,
                ),
              )
              .limit(1)
          )[0];

          if (!admin) {
            await tx
              .insert(platformAdmins)
              .values({
                userId: user.email,
                role: "owner",
              });
          }

          return {
            id: user.id,
            email: user.email,
            role: user.role,
            status: user.status,
          };
        },
      );

      res.status(200).json({
        success: true,
        user: result,
      });
    } catch (error) {
      req.log.error(
        { error },
        "Owner bootstrap failed",
      );

      res.status(500).json({
        error: "Owner bootstrap failed.",
      });
    }
  },
);

export default router;
