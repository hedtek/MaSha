# -*- encoding: utf-8 -*-
require File.expand_path('../lib/textselect-rails/version', __FILE__)

Gem::Specification.new do |gem|
  gem.authors       = ["Daniel Ghilea", "Hedtek"]
  gem.email         = ["danny@hedtek.com"]
  gem.description   = %q{Wrapper for a simplified version of the MaSha JS library (https://github.com/SmartTeleMax/MaSha).}
  gem.summary       = %q{Wrapper for a simplified version of the MaSha JS library (https://github.com/SmartTeleMax/MaSha).}
  gem.homepage      = "https://github.com/ghilead/MaSha"

  gem.files         = `git ls-files`.split($\)
  gem.name          = "textselect-rails"
  gem.require_paths = ["lib"]
  gem.version       = Textselect::Rails::VERSION

  gem.add_dependency "railties", "~> 3.1"
end
