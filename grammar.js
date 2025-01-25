/**
 * @file Python grammar for tree-sitter
 * @author Max Brunsfeld <maxbrunsfeld@gmail.com>
 * @license MIT
 * @see {@link https://docs.python.org/2/reference/grammar.html|Python 2 grammar}
 * @see {@link https://docs.python.org/3/reference/grammar.html|Python 3 grammar}
 */


/// <reference types="tree-sitter-cli/dsl" />
// @ts-check

const PREC = {
  // this resolves a conflict between the usage of ':' in a lambda vs in a
  // typed parameter. In the case of a lambda, we don't allow typed parameters.
  lambda: -2,
  typed_parameter: -1,
  conditional: -1,

  parenthesized_expression: 1,
  parenthesized_list_splat: 1,
  or: 10,
  and: 11,
  not: 12,
  compare: 13,
  bitwise_or: 14,
  bitwise_and: 15,
  xor: 16,
  shift: 17,
  plus: 18,
  times: 19,
  unary: 20,
  power: 21,
  call: 22,
};

const SEMICOLON = ';';

module.exports = grammar({
  name: 'python',

  extras: $ => [
    $.comment,
    /[\s\f\uFEFF\u2060\u200B]|\r?\n/,
    $.line_continuation,
  ],

  conflicts: $ => [
    [$.primary_expression, $.pattern],
    [$.primary_expression, $.list_splat_pattern],
    [$.tuple, $.tuple_pattern],
    [$.list, $.list_pattern],
    [$.with_item, $._collection_elements],
    [$.named_expression, $.as_pattern],
    [$.print_statement, $.primary_expression],
    [$.type_alias_statement, $.primary_expression],
    [$.match_statement, $.primary_expression],
  ],

  supertypes: $ => [
    $._simple_statement,
    $._compound_statement,
    $.expression,
    $.primary_expression,
    $.pattern,
    $.parameter,
  ],

  externals: $ => [
    $._newline,
    $._indent,
    $._dedent,
    $.string_start,
    $._string_content,
    $.escape_interpolation,
    $.string_end,

    // Mark comments as external tokens so that the external scanner is always
    // invoked, even if no external token is expected. This allows for better
    // error recovery, because the external scanner can maintain the overall
    // structure by returning dedent tokens whenever a dedent occurs, even
    // if no dedent is expected.
    $.comment,

    // Allow the external scanner to check for the validity of closing brackets
    // so that it can avoid returning dedent tokens between brackets.
    ']',
    ')',
    '}',
    'except',
  ],

  inline: $ => [
    $._simple_statement,
    $._compound_statement,
    $._suite,
    $._expressions,
    $._left_hand_side,
    $.keyword_identifier,
    $._for_in_clause_body,
    $._with_statement_content,
    $._function_definition_content,
  ],

  word: $ => $.identifier,

  rules: {
    module: $ => repeat($._statement),

    _statement: $ => choice(
      $._simple_statements,
      $._compound_statement,
    ),

    // Simple statements

    _simple_statements: $ => seq(
      sep1($._simple_statement, SEMICOLON),
      optional(SEMICOLON),
      $._newline,
    ),

    _simple_statement: $ => choice(
      $.future_import_statement,
      $.import_statement,
      $.import_from_statement,
      $.print_statement,
      $.assert_statement,
      $.expression_statement,
      $.return_statement,
      $.delete_statement,
      $.raise_statement,
      $.pass_statement,
      $.break_statement,
      $.continue_statement,
      $.global_statement,
      $.nonlocal_statement,
      $.exec_statement,
      $.type_alias_statement,
    ),

    import_statement: $ => seq(
      'import',
      $._import_list,
    ),

    relative_import: $ => seq(
      field('levels', $.rel_import_prefix),
      optional(field('module_name', $.dotted_name)),
    ),

    rel_import_prefix: _ => token(repeat1('.')),

    future_import_statement: $ => seq(
      'from',
      '__future__',
      'import',
      choice(
        $._import_list,
        seq('(', $._import_list, ')'),
      ),
    ),

    import_from_statement: $ => seq(
      'from',
      field('module_name', choice(
        $.relative_import,
        $.dotted_name,
      )),
      'import',
      choice(
        field('name', $.wildcard_import),
        $._import_list,
        seq('(', $._import_list, ')'),
      ),
    ),

    _import_list: $ => seq(
      commaSep1(field('name', choice(
        $.dotted_name,
        $.aliased_import,
      ))),
      optional(','),
    ),

    aliased_import: $ => seq(
      field('name', $.dotted_name),
      'as',
      field('alias', $.identifier),
    ),

    wildcard_import: _ => '*',

    print_statement: $ => choice(
      prec(1, seq(
        'print',
        field('to', $.chevron),
        repeat(seq(',', field('argument', $.expression))),
        optional(',')),
      ),
      prec(-3, prec.dynamic(-1, seq(
        'print',
        commaSep1(field('argument', $.expression)),
        optional(','),
      ))),
    ),

    chevron: $ => seq(
      '>>',
      $.expression,
    ),

    assert_statement: $ => seq(
      'assert',
      commaSep1($.expression),
    ),

    expression_statement: $ => choice(
      $.expression,
      seq(commaSep1($.expression), optional(',')),
      $.assignment,
      $.augmented_assignment,
      $._yield,
    ),

    named_expression: $ => seq(
      field('name', $._named_expression_lhs),
      ':=',
      field('value', $.expression),
    ),

    _named_expression_lhs: $ => choice(
      $.identifier,
      $.keyword_identifier,
    ),

    return_statement: $ => seq(
      'return',
      optional($._expressions),
    ),

    delete_statement: $ => seq(
      'del',
      $._expressions,
    ),

    _expressions: $ => choice(
      $.expression,
      $.expression_list,
    ),

    raise_statement: $ => seq(
      'raise',
      optional(field('exception', $._expressions)),
      optional(seq('from', field('cause', $.expression))),
    ),

    pass_statement: _ => prec.left('pass'),
    break_statement: _ => prec.left('break'),
    continue_statement: _ => prec.left('continue'),

    // Compound statements

    _compound_statement: $ => choice(
      $.if_statement,
      $.for_statement,
      $.async_for_statement,
      $.while_statement,
      $.try_statement,
      $.with_statement,
      $.async_with_statement,
      $.function_definition,
      $.async_function_definition,
      $.class_definition,
      $.decorated_definition,
      $.match_statement,
    ),

    if_statement: $ => seq(
      'if',
      field('condition', $.expression),
      ':',
      field('consequence', $._suite),
      repeat(field('elifs', $.elif_clause)),
      optional(field('else', $.else_clause)),
    ),

    elif_clause: $ => seq(
      'elif',
      field('condition', $.expression),
      ':',
      field('consequence', $._suite),
    ),

    else_clause: $ => seq(
      'else',
      ':',
      field('body', $._suite),
    ),

    match_statement: $ => seq(
      'match',
      commaSep1(field('subject', $.expression)),
      optional(','),
      ':',
      field('body', $.match_block),
    ),

    match_block: $ => choice(
      seq(
        $._indent,
        repeat(field('alternative', $.case_clause)),
        $._dedent,
      ),
      $._newline,
    ),

    case_clause: $ => seq(
      'case',
      field('pattern', commaSep1($.case_pattern)),
      optional(','),
      optional(field('guard', $.if_clause)),
      ':',
      field('consequence', $._suite),
    ),

    for_statement: $ => seq(
      'for',
      field('left', $._left_hand_side),
      'in',
      field('right', $._expressions),
      ':',
      field('body', $._suite),
      optional(field('else', $.else_clause)),
    ),

    async_for_statement: $ => seq(
      'async',
      'for',
      field('left', $._left_hand_side),
      'in',
      field('right', $._expressions),
      ':',
      field('body', $._suite),
      optional(field('else', $.else_clause)),
    ),

    while_statement: $ => seq(
      'while',
      field('condition', $.expression),
      ':',
      field('body', $._suite),
      optional(field('else', $.else_clause),)
    ),

    try_statement: $ => seq(
      'try',
      ':',
      field('body', $._suite),
      choice(
        seq(
          repeat1(field('except', $.except_clause)),
          optional(field('else', $.else_clause)),
          optional(field('finally', $.finally_clause)),
        ),
        seq(
          repeat1(field('except', $.except_group_clause)),
          optional(field('else', $.else_clause)),
          optional(field('finally', $.finally_clause)),
        ),
        field('finally', $.finally_clause),
      ),
    ),

    except_clause: $ => seq(
      'except',
      optional(seq(
        field('value', $.expression),
        optional(seq(
          choice('as', ','),
          field('alias', $.expression),
        )),
      )),
      ':',
      field('body', $._suite),
    ),

    except_group_clause: $ => seq(
      'except*',
      seq(
        field('except_expr', $.expression),
        optional(seq(
          'as',
          field('as_expr', $.expression),
        )),
      ),
      ':',
      field('body', $._suite),
    ),

    finally_clause: $ => seq(
      'finally',
      ':',
      $._suite,
    ),

    with_statement: $ => $._with_statement_content,

    async_with_statement: $ => seq(
      'async',
      $._with_statement_content,
    ),

    _with_statement_content: $ => seq(
      'with',
      field('with', $.with_clause),
      ':',
      field('body', $._suite),
    ),

    with_clause: $ => choice(
      seq(commaSep1($.with_item), optional(',')),
      seq('(', commaSep1($.with_item), optional(','), ')'),
    ),

    with_item: $ => prec.dynamic(1, seq(
      field('value', $.expression),
    )),

    function_definition: $ => $._function_definition_content,

    async_function_definition: $ => seq(
      'async',
      $._function_definition_content,
    ),

    _function_definition_content: $ => seq(
      'def',
      field('name', $.identifier),
      field('type_parameters', optional($.type_parameter)),
      field('parameters', $.parameters),
      optional(
        seq(
          '->',
          field('return_type', $.type),
        ),
      ),
      ':',
      field('body', $._suite),
    ),


    parameters: $ => seq(
      '(',
      optional($._parameters),
      ')',
    ),

    lambda_parameters: $ => $._parameters,

    list_splat: $ => seq(
      '*',
      $.expression,
    ),

    dictionary_splat: $ => seq(
      '**',
      $.expression,
    ),

    global_statement: $ => seq(
      'global',
      commaSep1($.identifier),
    ),

    nonlocal_statement: $ => seq(
      'nonlocal',
      commaSep1($.identifier),
    ),

    exec_statement: $ => seq(
      'exec',
      field('code', choice($.string, $.identifier)),
      optional(
        seq(
          'in',
          commaSep1(field('env', $.expression)),
        ),
      ),
    ),

    type_alias_statement: $ => prec.dynamic(1, seq(
      'type',
      field('left', $.type),
      '=',
      field('right', $.type),
    )),

    class_definition: $ => seq(
      'class',
      field('name', $.identifier),
      field('type_parameters', optional($.type_parameter)),
      field('superclasses', optional($.argument_list)),
      ':',
      field('body', $._suite),
    ),
    type_parameter: $ => seq(
      '[',
      commaSep1($.type),
      optional(','),
      ']',
    ),

    parenthesized_list_splat: $ => prec(PREC.parenthesized_list_splat, seq(
      '(',
      choice(
        alias($.parenthesized_list_splat, $.parenthesized_expression),
        $.list_splat,
      ),
      ')',
    )),

    argument_list: $ => seq(
      '(',
      optional(commaSep1(
        choice(
          $.expression,
          $.list_splat,
          $.dictionary_splat,
          alias($.parenthesized_list_splat, $.parenthesized_expression),
          $.keyword_argument,
        ),
      )),
      optional(','),
      ')',
    ),

    decorated_definition: $ => seq(
      repeat1(field('decorators', $.decorator)),
      field('definition', choice(
        $.class_definition,
        $.function_definition,
        $.async_function_definition,
      )),
    ),

    decorator: $ => seq(
      '@',
      $.expression,
      $._newline,
    ),

    _suite: $ => choice(
      alias($._simple_statements, $.block),
      seq($._indent, $.block),
      alias($._newline, $.block),
    ),

    block: $ => seq(
      repeat($._statement),
      $._dedent,
    ),

    expression_list: $ => prec.right(seq(
      $.expression,
      choice(
        ',',
        seq(
          repeat1(seq(
            ',',
            $.expression,
          )),
          optional(','),
        ),
      ),
    )),

    dotted_name: $ => prec(1, sep1($.identifier, '.')),

    // Match cases

    case_pattern: $ => prec(1, choice(
      $.match_as_pattern,
      $.keyword_pattern,
      $._simple_pattern,
    )),

    any_pattern: $ => '_',

    _simple_pattern: $ => prec(1, choice(
      $.class_pattern,
      $.splat_pattern,
      $.union_pattern,
      alias($._list_pattern, $.list_pattern),
      alias($._tuple_pattern, $.tuple_pattern),
      $.dict_pattern,
      $.string,
      $.concatenated_string,
      $.true,
      $.false,
      $.none,
      
      // seq(optional('-'), choice($.integer, $.float)),
      $.float,
      $.integer,
      $.negated_float,
      $.negated_integer,

      $.complex_pattern,
      $.dotted_name,
      $.any_pattern,
    )),

    match_as_pattern: $ => seq(
      field('value', $.case_pattern),
      'as',
      field('alias', $.identifier)
    ),

    union_pattern: $ => prec.right(seq($._simple_pattern, repeat1(prec.left(seq('|', $._simple_pattern))))),

    _list_pattern: $ => seq(
      '[',
      optional(seq(
        commaSep1($.case_pattern),
        optional(','),
      )),
      ']',
    ),

    _tuple_pattern: $ => seq(
      '(',
      optional(seq(
        commaSep1($.case_pattern),
        optional(','),
      )),
      ')',
    ),

    dict_pattern: $ => seq(
      '{',
      optional(seq(
        commaSep1(choice($.key_value_pattern, $.splat_pattern)),
        optional(','),
      )),
      '}',
    ),

    key_value_pattern: $ => seq(
      field('key', $._simple_pattern),
      ':',
      field('value', $.case_pattern),
    ),

    keyword_pattern: $ => seq(field('name', $.identifier), '=', field('pattern', $._simple_pattern)),

    splat_pattern: $ => prec(1, seq(field('splat', choice($.splat_pattern_list, $.splat_pattern_dict)), field('name', choice($.identifier, '_')))),

    splat_pattern_list: $ => token('*'),

    splat_pattern_dict: $ => token('**'),

    class_pattern: $ => seq(
      field('name', $.dotted_name),
      '(',
      optional(seq(
        field('patterns', commaSep1($.case_pattern)),
        optional(','),
      )),
      ')',
    ),

    complex_pattern: $ => prec(1, seq(
      field('real', $.complex_pattern_real),
      field('imaginary', $.complex_pattern_imag),
    )),

    complex_pattern_real: $ => seq(
      optional('-'),
      choice($.integer, $.float),
    ),

    complex_pattern_imag: $ => seq(
      choice('+', '-'),
      choice($.integer, $.float)
    ),

    // Patterns

    _parameters: $ => seq(
      commaSep1($.parameter),
      optional(','),
    ),

    _patterns: $ => seq(
      commaSep1($.pattern),
      optional(','),
    ),

    parameter: $ => choice(
      $.identifier,
      $.typed_parameter,
      $.default_parameter,
      $.typed_default_parameter,
      $.list_splat_pattern,
      $.tuple_pattern,
      $.keyword_separator,
      $.positional_separator,
      $.dictionary_splat_pattern,
    ),

    pattern: $ => choice(
      $.identifier,
      $.keyword_identifier,
      $.subscript,
      $.attribute,
      $.list_splat_pattern,
      $.tuple_pattern,
      $.list_pattern,
    ),

    tuple_pattern: $ => seq(
      '(',
      optional($._patterns),
      ')',
    ),

    list_pattern: $ => seq(
      '[',
      optional($._patterns),
      ']',
    ),

    default_parameter: $ => seq(
      field('name', choice($.identifier, $.tuple_pattern)),
      '=',
      field('value', $.expression),
    ),

    typed_default_parameter: $ => prec(PREC.typed_parameter, seq(
      field('name', $.identifier),
      ':',
      field('type', $.type),
      '=',
      field('value', $.expression),
    )),

    list_splat_pattern: $ => seq(
      '*',
      choice($.identifier, $.keyword_identifier, $.subscript, $.attribute),
    ),

    dictionary_splat_pattern: $ => seq(
      '**',
      choice($.identifier, $.keyword_identifier, $.subscript, $.attribute),
    ),

    // Extended patterns (patterns allowed in match statement are far more flexible than simple patterns though still a subset of "expression")

    as_pattern: $ => prec.left(seq(
      field('value', $.expression),
      'as',
      field('alias', $.expression),
    )),

    // Expressions

    _expression_within_for_in_clause: $ => choice(
      $.expression,
      alias($.lambda_within_for_in_clause, $.lambda),
    ),

    expression: $ => choice(
      $.comparison_operator,
      $.not_operator,
      $.boolean_operator,
      $.lambda,
      $.primary_expression,
      $.conditional_expression,
      $.named_expression,
      $.as_pattern,
    ),

    primary_expression: $ => choice(
      $.await,
      $.binary_operator,
      $.identifier,
      $.keyword_identifier,
      $.string,
      $.concatenated_string,
      $.integer,
      $.float,
      $.true,
      $.false,
      $.none,
      $.unary_operator,
      $.attribute,
      $.subscript,
      $.call,
      $.list,
      $.list_comprehension,
      $.dictionary,
      $.dictionary_comprehension,
      $.set,
      $.set_comprehension,
      $.tuple,
      $.parenthesized_expression,
      $.generator_expression,
      $.ellipsis,
      alias($.list_splat_pattern, $.list_splat),
    ),

    not_operator: $ => prec(PREC.not, seq(
      'not',
      field('argument', $.expression),
    )),

    bool_op_and: $ => 'and',
    bool_op_or: $ => 'or',

    boolean_operator: $ => choice(
      prec.left(PREC.and, seq(
        field('left', $.expression),
        field('operator', $.bool_op_and),
        field('right', $.expression),
      )),
      prec.left(PREC.or, seq(
        field('left', $.expression),
        field('operator', $.bool_op_or),
        field('right', $.expression),
      )),
    ),

    op_plus: $ => '+',
    op_minus: $ => '-',
    op_mul: $ => '*',
    op_matmul: $ => '@',
    op_div: $ => '/',
    op_mod: $ => '%',
    op_floordiv: $ => '//',
    op_pow: $ => '**',
    op_bitwise_or: $ => '|',
    op_bitwise_and: $ => '&',
    op_bitwise_xor: $ => '^',
    op_bitwise_not: $ => '~',
    op_lshift: $ => '<<',
    op_rshift: $ => '>>',

    binary_operator: $ => {
      const table = [
        [prec.left, $.op_plus, PREC.plus],
        [prec.left, $.op_minus, PREC.plus],
        [prec.left, $.op_mul, PREC.times],
        [prec.left, $.op_matmul, PREC.times],
        [prec.left, $.op_div, PREC.times],
        [prec.left, $.op_mod, PREC.times],
        [prec.left, $.op_floordiv, PREC.times],
        [prec.right, $.op_pow, PREC.power],
        [prec.left, $.op_bitwise_or, PREC.bitwise_or],
        [prec.left, $.op_bitwise_and, PREC.bitwise_and],
        [prec.left, $.op_bitwise_xor, PREC.xor],
        [prec.left, $.op_lshift, PREC.shift],
        [prec.left, $.op_rshift, PREC.shift],
      ];

      // @ts-ignore
      return choice(...table.map(([fn, operator, precedence]) => fn(precedence, seq(
        field('left', $.primary_expression),
        // @ts-ignore
        field('operator', operator),
        field('right', $.primary_expression),
      ))));
    },

    unary_operator: $ => prec(PREC.unary, seq(
      field('operator', choice(
        $.op_plus,
        $.op_minus,
        $.op_bitwise_not
      )),
      field('argument', $.primary_expression),
    )),

    cmp_op_lt: $ => '<',
    cmp_op_lte: $ => '<=',
    cmp_op_eq: $ => '==',
    cmp_op_ne: $ => '!=',
    cmp_op_gte: $ => '>=',
    cmp_op_gt: $ => '>',
    cmp_op_ne2: $ => '<>',
    cmp_op_in: $ => 'in',
    cmp_op_not_in: $ => alias(seq('not', 'in'), 'not in'),
    cmp_op_is: $ => 'is',
    cmp_op_is_not: $ => alias(seq('is', 'not'), 'is not'),

    cmp_pair_op_val: $ => seq(
      field('operator',
        choice(
          $.cmp_op_lt,
          $.cmp_op_lte,
          $.cmp_op_eq,
          $.cmp_op_ne,
          $.cmp_op_gte,
          $.cmp_op_gt,
          $.cmp_op_ne2,
          $.cmp_op_in,
          $.cmp_op_not_in,
          $.cmp_op_is,
          $.cmp_op_is_not,
        )),
      field('value', $.primary_expression),
    ),

    comparison_operator: $ => prec.left(PREC.compare, seq(
      field('left', $.primary_expression),
      field('right', repeat1(seq($.cmp_pair_op_val)),
    ))),

    lambda: $ => prec(PREC.lambda, seq(
      'lambda',
      field('parameters', optional($.lambda_parameters)),
      ':',
      field('body', $.expression),
    )),

    lambda_within_for_in_clause: $ => seq(
      'lambda',
      field('parameters', optional($.lambda_parameters)),
      ':',
      field('body', $._expression_within_for_in_clause),
    ),

    assignment: $ => seq(
      field('left', $._left_hand_side),
      choice(
        seq('=', field('right', $._right_hand_side)),
        seq(':', field('type', $.type)),
        seq(':', field('type', $.type), '=', field('right', $._right_hand_side)),
      ),
    ),

    op_aug_add: $ => '+=',
    op_aug_sub: $ => '-=',
    op_aug_mul: $ => '*=',
    op_aug_matmul: $ => '@=',
    op_aug_div: $ => '/=',
    op_aug_mod: $ => '%=',
    op_aug_floordiv: $ => '//=',
    op_aug_pow: $ => '**=',
    op_aug_lshift: $ => '<<=',
    op_aug_rshift: $ => '>>=',
    op_aug_bitwise_or: $ => '|=',
    op_aug_bitwise_and: $ => '&=',
    op_aug_bitwise_xor: $ => '^=',

    augmented_assignment: $ => seq(
      field('left', $._left_hand_side),
      field('operator', choice(
        $.op_aug_add,
        $.op_aug_sub,
        $.op_aug_mul,
        $.op_aug_matmul,
        $.op_aug_div,
        $.op_aug_mod,
        $.op_aug_floordiv,
        $.op_aug_pow,
        $.op_aug_lshift,
        $.op_aug_rshift,
        $.op_aug_bitwise_or,
        $.op_aug_bitwise_and,
        $.op_aug_bitwise_xor,
      )),
      field('right', $._right_hand_side),
    ),

    _left_hand_side: $ => choice(
      $.pattern,
      $.pattern_list,
    ),

    pattern_list: $ => seq(
      $.pattern,
      choice(
        ',',
        seq(
          repeat1(seq(
            ',',
            $.pattern,
          )),
          optional(','),
        ),
      ),
    ),

    _right_hand_side: $ => choice(
      $.expression,
      $.expression_list,
      $.assignment,
      $.augmented_assignment,
      $.pattern_list,
      $._yield,
    ),

    _yield: $ => choice($.yield, $.yield_from),

    yield: $ => prec.right(seq(
      'yield',
      optional(field('value', $._expressions)),
    )),

    yield_from: $ => prec.right(seq(
      'yield',
      'from',
      field('value', $.expression),
    )),

    attribute: $ => prec(PREC.call, seq(
      field('object', $.primary_expression),
      '.',
      field('attribute', $.identifier),
    )),

    subscript: $ => prec(PREC.call, seq(
      field('value', $.primary_expression),
      '[',
      commaSep1(field('subscript', choice($.expression, $.slice))),
      optional(','),
      ']',
    )),

    slice: $ => seq(
      field('start', optional($.expression)),
      ':',
      field('stop', optional($.expression)),
      optional(seq(':', field('step', optional($.expression)))),
    ),

    ellipsis: _ => '...',

    call: $ => prec(PREC.call, seq(
      field('function', $.primary_expression),
      field('arguments', choice(
        $.generator_expression,
        $.argument_list,
      )),
    )),

    typed_parameter: $ => prec(PREC.typed_parameter, seq(
      choice(
        $.identifier,
        $.list_splat_pattern,
        $.dictionary_splat_pattern,
      ),
      ':',
      field('type', $.type),
    )),

    type: $ => choice(
      prec(1, $.expression),
      $.splat_type,
      $.generic_type,
      $.union_type,
      $.constrained_type,
      $.member_type,
    ),
    splat_type: $ => prec(1, seq(choice('*', '**'), $.identifier)),
    generic_type: $ => prec(1, seq(
      choice(
        field('type', $.identifier),
        field('type', alias('type', $.identifier)),
      ),
      field('parameter', $.type_parameter),
    )),
    union_type: $ => prec.left(seq(
      field('left', $.type),
      '|',
      field('right', $.type)
    )),
    constrained_type: $ => prec.right(seq(
      field('type', $.type),
      ':',
      field('constraint', $.type)
    )),
    member_type: $ => seq(
      field('type', $.type),
      '.',
      field('member', $.identifier)
    ),
    keyword_argument: $ => seq(
      field('name', choice($.identifier, $.keyword_identifier)),
      '=',
      field('value', $.expression),
    ),

    // Literals

    list: $ => seq(
      '[',
      optional($._collection_elements),
      ']',
    ),

    set: $ => seq(
      '{',
      $._collection_elements,
      '}',
    ),

    tuple: $ => seq(
      '(',
      optional($._collection_elements),
      ')',
    ),

    dictionary: $ => seq(
      '{',
      optional(commaSep1(field('elements', choice($.pair, $.dictionary_splat)))),
      optional(','),
      '}',
    ),

    pair: $ => seq(
      field('key', $.expression),
      ':',
      field('value', $.expression),
    ),

    list_comprehension: $ => seq(
      '[',
      field('body', $.expression),
      field('comprehensions', $._comprehension_clauses),
      ']',
    ),

    dictionary_comprehension: $ => seq(
      '{',
      field('body', $.pair),
      field('comprehensions', $._comprehension_clauses),
      '}',
    ),

    set_comprehension: $ => seq(
      '{',
      field('body', $.expression),
      field('comprehensions', $._comprehension_clauses),
      '}',
    ),

    generator_expression: $ => seq(
      '(',
      field('body', $.expression),
      field('comprehensions', $._comprehension_clauses),
      ')',
    ),

    _comprehension_clauses: $ => seq(
      $._for_or_async_for_in_clause,
      repeat(choice(
        $._for_or_async_for_in_clause,
        $.if_clause,
      )),
    ),

    parenthesized_expression: $ => prec(PREC.parenthesized_expression, seq(
      '(',
      choice($.expression, $._yield),
      ')',
    )),

    _collection_elements: $ => seq(
      commaSep1(choice(
        $.expression, $._yield, $.list_splat, $.parenthesized_list_splat,
      )),
      optional(','),
    ),

    _for_or_async_for_in_clause: $ => choice($.for_in_clause, $.async_for_in_clause),
    
    for_in_clause: $ => prec.left($._for_in_clause_body),
    async_for_in_clause: $ => prec.left(seq('async', $._for_in_clause_body)),

    _for_in_clause_body: $ => seq(
      'for',
      field('left', $._left_hand_side),
      'in',
      field('right', commaSep1($._expression_within_for_in_clause)),
      optional(','),
    ),

    if_clause: $ => seq(
      'if',
      $.expression,
    ),

    conditional_expression: $ => prec.right(PREC.conditional, seq(
      field('if_true', $.expression),
      'if',
      field('condition', $.expression),
      'else',
      field('if_false', $.expression),
    )),

    concatenated_string: $ => seq(
      $.string,
      repeat1($.string),
    ),

    string: $ => seq(
      field('start', $.string_start),
      field('content', repeat(choice($.interpolation, $.string_content))),
      field('end', $.string_end),
    ),

    string_content: $ => prec.right(repeat1(
      choice(
        $.escape_interpolation,
        $.escape_sequence,
        $._not_escape_sequence,
        $._string_content,
      ))),

    interpolation: $ => seq(
      '{',
      field('expression', $._f_expression),
      optional('='),
      optional(field('type_conversion', $.type_conversion)),
      optional(field('format_specifier', $.format_specifier)),
      '}',
    ),

    _f_expression: $ => choice(
      $.expression,
      $.expression_list,
      $.pattern_list,
      $._yield,
    ),

    escape_sequence: _ => token.immediate(prec(1, seq(
      '\\',
      choice(
        /u[a-fA-F\d]{4}/,
        /U[a-fA-F\d]{8}/,
        /x[a-fA-F\d]{2}/,
        /\d{1,3}/,
        /\r?\n/,
        /['"abfrntv\\]/,
        /N\{[^}]+\}/,
      ),
    ))),

    _not_escape_sequence: _ => token.immediate('\\'),

    format_specifier: $ => seq(
      ':',
      repeat(choice(
        token(prec(1, /[^{}\n]+/)),
        alias($.interpolation, $.format_expression),
      )),
    ),

    type_conversion: _ => /![a-z]/,

    integer: _ => token(choice(
      seq(
        choice('0x', '0X'),
        repeat1(/_?[A-Fa-f0-9]+/),
        optional(/[Ll]/),
      ),
      seq(
        choice('0o', '0O'),
        repeat1(/_?[0-7]+/),
        optional(/[Ll]/),
      ),
      seq(
        choice('0b', '0B'),
        repeat1(/_?[0-1]+/),
        optional(/[Ll]/),
      ),
      seq(
        repeat1(/[0-9]+_?/),
        choice(
          optional(/[Ll]/), // long numbers
          optional(/[jJ]/), // complex numbers
        ),
      ),
    )),

    negated_integer: $ => seq(
      '-', $.integer,
    ),

    float: _ => {
      const digits = repeat1(/[0-9]+_?/);
      const exponent = seq(/[eE][\+-]?/, digits);

      return token(seq(
        choice(
          seq(digits, '.', optional(digits), optional(exponent)),
          seq(optional(digits), '.', digits, optional(exponent)),
          seq(digits, exponent),
        ),
        optional(/[jJ]/),
      ));
    },

    negated_float: $ => seq(
      '-', $.float
    ),

    identifier: _ => /[_\p{XID_Start}][_\p{XID_Continue}]*/,

    keyword_identifier: $ => choice(
      prec(-3, alias(
        choice(
          'print',
          'exec',
          'async',
          'await',
        ),
        $.identifier,
      )),
      alias(
        choice('type', 'match'),
        $.identifier,
      ),
    ),

    true: _ => 'True',
    false: _ => 'False',
    none: _ => 'None',

    await: $ => prec(PREC.unary, seq(
      'await',
      $.primary_expression,
    )),

    comment: _ => token(seq('#', /.*/)),

    line_continuation: _ => token(seq('\\', choice(seq(optional('\r'), '\n'), '\0'))),

    positional_separator: _ => '/',
    keyword_separator: _ => '*',
  },
});

module.exports.PREC = PREC;

/**
 * Creates a rule to match one or more of the rules separated by a comma
 *
 * @param {RuleOrLiteral} rule
 *
 * @returns {SeqRule}
 */
function commaSep1(rule) {
  return sep1(rule, ',');
}

/**
 * Creates a rule to match one or more occurrences of `rule` separated by `sep`
 *
 * @param {RuleOrLiteral} rule
 *
 * @param {RuleOrLiteral} separator
 *
 * @returns {SeqRule}
 */
function sep1(rule, separator) {
  return seq(rule, repeat(seq(separator, rule)));
}
