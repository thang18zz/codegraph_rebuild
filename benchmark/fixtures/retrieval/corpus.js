export const retrievalFixtures = Object.freeze({
  auth: {
    "auth.py": `
class TokenService:
    def refresh(self):
        return True
`,
  },
  duplicate_refresh: {
    "service_a.py": `
class User:
    def refresh(self):
        return 1
`,
    "service_b.py": `
class User:
    def refresh(self):
        return 2
`,
  },
  documentation: {
    "docs.py": `
def rotate_credentials():
    """Renew expired session credentials safely."""
    return True
`,
  },
  generic: {
    "generic.py": `
def run():
    return 1

def service():
    return 2

def handler():
    return 3
`,
  },
  entry_trap: {
    "alpha.py": `
def main():
    return 1

def handler():
    return 2
`,
    "billing.py": `
def checkout():
    return 3
`,
  },
  generated_noise: {
    "app.py": `
def process_order():
    return "source"
`,
    "generated/client.py": `
def process_order():
    return "generated"
`,
  },
  cross_module: {
    "target.py": `
def execute():
    return True
`,
    "caller.py": `
from target import execute

def dispatch():
    return execute()
`,
  },
  unsupported_impact: {
    "api.py": `
def public_api():
    return True
`,
    "plugin.rb": "register(:public_api)\n",
    "routes.yaml": "handler: public_api\n",
  },
  csharp_flow: {
    "Services/IAuthService.cs": `
namespace Demo.Services;
public interface IAuthService { Task<Result> LoginAsync(LoginDto dto); }
`,
    "Controllers/AuthController.cs": `
using Demo.Services;
namespace Demo.Controllers;
[ApiController]
[Route("api/auth")]
public class AuthController {
  private readonly IAuthService _authService;
  public AuthController(IAuthService authService) => _authService = authService;
  [HttpPost("login")]
  public Task<Result> Login(LoginDto dto) => _authService.LoginAsync(dto);
}
`,
  },
  csharp_gpu: {
    "GpuCatalog.cs": "namespace Demo; public class GpuCatalog {}\n",
  },
});
