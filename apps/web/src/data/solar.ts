import type { CapabilityDoc } from "@vbd/compiler";

/**
 * Bundled solar reference data for the MVP shell (mirrors workspaces/solar-example).
 * In later milestones this comes from the service (git-backed workspace, ADR-002); the shell
 * bundles it so the UI runs standalone.
 */

export const narrativeMd = `# Sonnenkraft Solar GmbH

## Purpose
A solar installer helps residential and commercial customers design, purchase, install,
and maintain renewable energy systems (PV, battery storage, and related electrical work).

## Customers
- Homeowners
- Commercial building owners

## Business Outcomes
- Sell projects
- Install systems
- Maintain systems

## Core Activities
- Acquire leads
- Qualify customers
- Survey roofs
- Create technical design
- Create commercial offer
- Purchase equipment
- Schedule installation
- Install
- Commission
- Invoice
- Monitor
- Maintain

## Constraints
- Seasonal installation capacity
- Regional grid-connection and permitting rules
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
