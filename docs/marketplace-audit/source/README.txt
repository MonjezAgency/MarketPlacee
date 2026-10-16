Working sources for the audit documents. The deliverables are the .docx files one folder up:

  ../Marketplace_Gap_Register.docx
  ../Systems_Inventory.docx
  ../Order_Payment_Refund_Gaps.docx
  ../Design_vs_Systems_Boundary.docx
  ../Implementation_Roadmap.docx

To regenerate after editing a source (requires python-docx 1.1.2):
  python3 -I md2docx.py MARKETPLACE_GAP_REGISTER.md ../Marketplace_Gap_Register.docx "Marketplace Gap Register" "<subtitle>"
