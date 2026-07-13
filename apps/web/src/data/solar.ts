import type { CapabilityDoc } from "@vbd/compiler";

/**
 * Bundled solar reference data for the MVP shell (mirrors workspaces/solar-example).
 * In later milestones this comes from the service (git-backed workspace, ADR-002); the shell
 * bundles it so the UI runs standalone.
 */

export const narrativeMd = `# Sonnenkraft Solar GmbH

## Purpose
Sonnenkraft Solar is a regional solar installer. We help homeowners and commercial building owners
move to renewable energy end-to-end: we win the customer, survey the roof, engineer the system,
quote it, procure the hardware, install and commission it, then monitor and service it for years.
Photovoltaic (PV) panels are the core, but most jobs also involve battery storage, inverters,
electrical work, and — increasingly — EV chargers and heat-pump tie-ins. We make money by selling
projects, delivering them on time and on budget, and keeping the installed fleet healthy under
service contracts.

## Customers
- **Homeowners** — a single roof, a few weeks of decision-making, price- and trust-sensitive; the
  bulk of our volume.
- **Commercial building owners** — warehouses, farms, small industry; larger systems, longer sales
  cycles, formal tenders, and stricter grid-connection requirements.
- **Housing cooperatives / landlords** — multi-unit buildings where the tenant and the bill-payer
  differ (tenant-electricity models).

## Business Outcomes
- Win profitable projects (a signed contract from a qualified lead).
- Design systems that are safe, permit-able, and match the customer's energy goal.
- Deliver installations that pass commissioning and grid connection the first time.
- Get paid on schedule (deposit, milestone, final invoice).
- Keep systems producing — catch faults early and honour service-level promises.

## Core Activities
- **Acquire leads** from the website, referrals, trade fairs, and partner electricians; log and route them.
- **Qualify** the lead: energy use, roof suitability, budget, timeline, decision-maker.
- **Survey the site** — roof geometry, shading, structure, electrical panel; on-site or remote.
- **Design the system** — panel layout, string sizing, inverter/battery selection, a bill of materials.
- **Produce a commercial offer** from the design; negotiate; capture the signed contract.
- **Procure** components against the bill of materials; track supplier lead times and stock.
- **Schedule** the installation crew around weather, permits, and grid-connection appointments.
- **Install and commission** — mount, wire, test, and hand over; file the grid-connection paperwork.
- **Invoice** across milestones and reconcile payments.
- **Monitor** production remotely; **maintain** under service contracts; handle warranty claims.

## Roles
- **Sales** — owns leads, offers, and contracts.
- **Planner / Engineer** — owns surveys, designs, and the bill of materials.
- **Procurement** — owns purchase orders and supplier relationships.
- **Installer / Crew lead** — owns on-site delivery and commissioning.
- **Service technician** — owns monitoring alerts and maintenance visits.
- **Office / Finance** — owns invoicing, payments, and permitting paperwork.

## Channels
- Email and phone with customers; a customer portal for offer acceptance and system status.
- Supplier ordering (some via spreadsheets/EDI); the grid operator's connection portal.
- Field app for crews (checklists, photos, sign-off).

## Constraints
- **Seasonal capacity** — installs peak in spring/summer; crews and scaffolding are the bottleneck.
- **Regulation** — regional permitting, grid-connection rules, and electrical safety codes vary by area.
- **Supply lead times** — panels, inverters, and batteries can slip weeks; procurement must de-risk dates.
- **Safety & liability** — roof work and high-voltage DC demand strict, auditable procedures.
`;

export const solarCapabilities: CapabilityDoc = {
  version: "0.2",
  domain: "solar-installer",
  capabilities: [
    { id: "lead_management", name: "Lead Management", purpose: "Acquire and qualify prospective customers.", outcomes: ["qualified_lead"], actors: ["Sales"], produces: ["Lead"], depends_on: [] },
    { id: "planning", name: "Planning", purpose: "Create technical energy-system designs for a customer's site.", outcomes: ["approved_design"], actors: ["Planner"], produces: ["EnergySystemDesign", "BillOfMaterials"], consumes: ["Lead"], depends_on: ["lead_management"] },
    { id: "offer_management", name: "Offer Management", purpose: "Turn an approved design into a commercial offer and win the order.", outcomes: ["signed_contract"], actors: ["Sales"], produces: ["Offer", "Contract"], consumes: ["EnergySystemDesign"], depends_on: ["planning"] },
    { id: "procurement", name: "Procurement", purpose: "Source and secure components and their availability.", outcomes: ["materials_available"], produces: ["PurchaseOrder"], consumes: ["BillOfMaterials"], depends_on: ["planning"] },
    { id: "installation", name: "Installation", purpose: "Execute and commission the ordered system on site.", outcomes: ["system_commissioned"], actors: ["Installer"], produces: ["InstalledSystem"], consumes: ["Contract", "PurchaseOrder"], depends_on: ["offer_management", "procurement"] },
    { id: "monitoring", name: "Monitoring & Service", purpose: "Operate, monitor, and maintain installed systems.", outcomes: ["system_healthy"], produces: ["MonitoringData"], consumes: ["InstalledSystem"], depends_on: ["installation"] },
    { id: "billing", name: "Billing", purpose: "Financial settlement of delivered projects and services.", outcomes: ["invoice_paid"], produces: ["Invoice", "Payment"], consumes: ["Contract"], depends_on: ["offer_management"] },
  ],
};
