import os
import re

def fix_imports(filepath, class_name):
    if not os.path.exists(filepath): return
    with open(filepath, 'r') as f:
        content = f.read()
    
    if class_name in content and f"{class_name}," not in content and f", {class_name}" not in content and f" {class_name} " not in content:
        # Check if @nestjs/common is imported
        if "@nestjs/common" in content:
            # Add to existing import
            new_content = re.sub(r"import \{(.*?)\} from '@nestjs/common';", rf"import {\1, {class_name}} from '@nestjs/common';", content)
            # Clean up potential double commas
            new_content = new_content.replace(", ,", ",")
            if new_content != content:
                with open(filepath, 'w') as f:
                    f.write(new_content)
                print(f"Fixed import in: {filepath}")

# Fix users.service.ts
fix_imports("backend/src/users/users.service.ts", "ForbiddenException")

# Fix payments.service.ts Stripe version
payments_path = "backend/src/payments/payments.service.ts"
if os.path.exists(payments_path):
    with open(payments_path, 'r') as f:
        p_content = f.read()
    
    # Change apiVersion to something valid or remove it to use default
    new_p_content = p_content.replace("apiVersion: '2024-06-20',", "// apiVersion: '2024-06-20',")
    if new_p_content != p_content:
        with open(payments_path, 'w') as f:
            f.write(new_p_content)
        print(f"Fixed Stripe version in: {payments_path}")

# Fix createPaymentIntent signature if needed
# (The user's spec expects specific structure)
