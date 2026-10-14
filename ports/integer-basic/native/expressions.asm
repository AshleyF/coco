; Native recursive precedence evaluator. D=result, X=source cursor.
; Recursion uses the 6809 hardware stack; all operand saves are balanced on error.
; error_code: 0 success, 1 syntax, 2 arithmetic/range. No host language execution.
; This replaces the staged literal-only front end, not the original tokenizer.
expr_abort
        puls    d,pc
expr_syntax
        lda     #1
        sta     error_code
        rts
expr_range
        tst     validation_mode
        beq     expr_literal_range
        ldd     #0
        rts
expr_literal_range
        lda     #2
        sta     error_code
        rts

; OR < AND < comparison < addition/subtraction < multiplication/division/MOD.
parse_or
        jsr     parse_and
or_again
        pshs    d
        tst     error_code
        lbne    expr_abort
        jsr     skip_spaces
        ldu     #word_or
        jsr     keyword
        lbcc    expr_abort
        jsr     parse_and
        std     rhs_be
        tst     error_code
        lbne    expr_abort
        puls    d
        cmpd    #0
        bne     or_true
        ldd     rhs_be
        cmpd    #0
        beq     or_false
or_true ldd     #1
        bra     or_again
or_false
        ldd     #0
        bra     or_again
parse_and
        jsr     parse_compare
and_again
        pshs    d
        tst     error_code
        lbne    expr_abort
        jsr     skip_spaces
        ldu     #word_and
        jsr     keyword
        lbcc    expr_abort
        jsr     parse_compare
        std     rhs_be
        tst     error_code
        lbne    expr_abort
        puls    d
        cmpd    #0
        beq     and_false
        ldd     rhs_be
        cmpd    #0
        beq     and_false
        ldd     #1
        bra     and_again
and_false
        ldd     #0
        bra     and_again
parse_compare
        jsr     parse_sum
compare_again
        pshs    d
        tst     error_code
        lbne    expr_abort
        jsr     skip_spaces
        lda     ,x
        cmpa    #'='
        beq     compare_single
        cmpa    #'#'
        beq     compare_single
        cmpa    #'<'
        beq     compare_less
        cmpa    #'>'
        lbne    expr_abort
        leax    1,x
        ldb     ,x
        cmpb    #'='
        bne     compare_push
        leax    1,x
        lda     #'G'
        bra     compare_push
compare_less
        leax    1,x
        ldb     ,x
        cmpb    #'='
        beq     compare_le
        cmpb    #'>'
        bne     compare_push
        leax    1,x
        lda     #'#'
        bra     compare_push
compare_le
        leax    1,x
        lda     #'L'
        bra     compare_push
compare_single
        leax    1,x
compare_push
        pshs    a
        jsr     parse_sum
        std     rhs_be
        puls    a
        sta     comparison
        tst     error_code
        lbne    expr_abort
        ldd     rhs_be
        cmpd    #$8000          ; original subtraction first negates RHS
        beq     comparison_range
        puls    d
        subd    rhs_be
        lbvs    expr_range
        std     lhs_be
        lda     comparison
        cmpa    #'L'
        beq     compare_neg_check
        cmpa    #'>'
        bne     compare_classify
compare_neg_check
        ldd     lhs_be          ; original <= and > negate the difference
        cmpd    #$8000
        lbeq    expr_range
compare_classify
        lda     comparison
        cmpa    #'='
        beq     compare_equal
        cmpa    #'#'
        beq     compare_unequal
        cmpa    #'<'
        beq     compare_lt
        cmpa    #'>'
        beq     compare_gt
        cmpa    #'L'
        beq     compare_lte
        ldd     lhs_be
        bpl     compare_true
        bra     compare_false
compare_equal
        ldd     lhs_be
        beq     compare_true
        bra     compare_false
compare_unequal
        ldd     lhs_be
        bne     compare_true
        bra     compare_false
compare_lt
        ldd     lhs_be
        bmi     compare_true
        bra     compare_false
compare_gt
        ldd     lhs_be
        ble     compare_false
        bra     compare_true
compare_lte
        ldd     lhs_be
        ble     compare_true
compare_false
        ldd     #0
        lbra    compare_again
compare_true
        ldd     #1
        lbra    compare_again
comparison_range
        puls    d
        lbra    expr_range
parse_sum
        jsr     parse_term
sum_again
        pshs    d
        tst     error_code
        lbne    expr_abort
        jsr     skip_spaces
        lda     ,x
        cmpa    #'+'
        beq     sum_found
        cmpa    #'-'
        lbne    expr_abort
sum_found
        leax    1,x
        pshs    a
        jsr     parse_term
        std     rhs_be
        puls    a
        tst     error_code
        lbne    expr_abort
        cmpa    #'-'
        beq     sum_subtract
        puls    d
        addd    rhs_be
        lbvs    expr_range
        bra     sum_again
sum_subtract
        ldd     rhs_be
        cmpd    #$8000
        beq     comparison_range
        puls    d
        subd    rhs_be
        lbvs    expr_range
        bra     sum_again
parse_term
        jsr     parse_unary
term_again
        pshs    d
        tst     error_code
        lbne    expr_abort
        jsr     skip_spaces
        lda     ,x
        cmpa    #'*'
        beq     term_found
        cmpa    #'/'
        beq     term_found
        ldu     #word_mod
        jsr     keyword
        lbcc    expr_abort
        lda     #'M'
        bra     term_push
term_found
        leax    1,x
term_push
        pshs    a
        jsr     parse_unary
        std     rhs_be
        puls    a
        sta     math_operator
        tst     error_code
        lbne    expr_abort
        puls    d
        std     lhs_be
        jsr     signed_math
        lbra    term_again
parse_unary
        jsr     skip_spaces
        lda     ,x
        cmpa    #'+'
        beq     unary_plus
        cmpa    #'-'
        beq     unary_minus
        ldu     #word_not
        jsr     keyword
        bcs     unary_not
        lbra    parse_primary
unary_plus
        leax    1,x
        lbra    parse_unary
unary_minus
        leax    1,x
        jsr     parse_unary
        tst     error_code
        lbne    unary_done
        std     rhs_be
        ldd     #0
        subd    rhs_be
        lbvs    expr_range
unary_done
        rts
unary_not
        jsr     parse_unary
        tst     error_code
        lbne    unary_done
        cmpd    #0
        beq     not_true
        ldd     #0
        rts
not_true
        ldd     #1
        rts
parse_primary
        jsr     skip_spaces
        lda     ,x
        cmpa    #'('
        beq     primary_paren
        cmpa    #'0'
        blo     primary_function
        cmpa    #'9'
        lbls    parse_integer
primary_function
        ldu     #word_abs
        jsr     keyword
        bcs     primary_abs
        ldu     #word_sgn
        jsr     keyword
        bcs     primary_sgn
        lda     ,x+
        cmpa    #'A'
        lblo    expr_syntax
        cmpa    #'Z'
        lbhi    expr_syntax
        suba    #'A'
        lsla
        tfr     a,b
        clra
        ldu     #variables
        leau    d,u
        ldb     ,u             ; explicit original-layout LE scalar
        lda     1,u
        rts
primary_paren
        leax    1,x
        jsr     parse_or
        pshs    d
        tst     error_code
        lbne    expr_abort
        jsr     skip_spaces
        lda     ,x+
        cmpa    #')'
        beq     primary_close
        puls    d
        lbra    expr_syntax
primary_close
        puls    d,pc
primary_abs
        lda     #'A'
        bra     function_paren
primary_sgn
        lda     #'S'
function_paren
        pshs    a
        jsr     skip_spaces
        lda     ,x
        cmpa    #'('
        bne     function_syntax
        jsr     primary_paren
        std     lhs_be
        puls    a
        tst     error_code
        lbne    unary_done
        cmpa    #'A'
        bne     function_sign
        ldd     lhs_be
        lbpl    unary_done
        ldd     #0
        subd    lhs_be
        lbvs    expr_range
        rts
function_sign
        ldd     lhs_be
        lbeq    unary_done
        bmi     sign_negative
        ldd     #1
        rts
sign_negative
        ldd     #-1
        rts
function_syntax
        puls    a
        lbra    expr_syntax

; Original mult/divide/MOD normalize operand magnitudes and apply the XOR of
; operand signs to quotient AND remainder. Reject un-negatable -32768 operands.
signed_math
        lda     lhs_be
        eora    rhs_be
        anda    #$80
        sta     math_negative
        ldd     lhs_be
        bpl     lhs_positive
        ldd     #0
        subd    lhs_be
        lbvs    expr_range
        std     lhs_be
lhs_positive
        ldd     rhs_be
        bpl     rhs_positive
        ldd     #0
        subd    rhs_be
        lbvs    expr_range
        std     rhs_be
rhs_positive
        clr     product_be
        clr     product_be+1
        lda     math_operator
        cmpa    #'*'
        bne     divide_magnitudes
multiply_loop
        ldd     rhs_be
        beq     signed_result
        subd    #1
        std     rhs_be
        ldd     product_be
        addd    lhs_be
        cmpd    #32767
        lbhi    expr_range
        std     product_be
        bra     multiply_loop
divide_magnitudes
        ldd     rhs_be
        lbeq    expr_range
divide_loop
        ldd     lhs_be
        cmpd    rhs_be
        blo     division_done
        subd    rhs_be
        std     lhs_be
        ldd     product_be
        addd    #1
        std     product_be
        bra     divide_loop
division_done
        lda     math_operator
        cmpa    #'M'
        bne     signed_result
        ldd     lhs_be
        std     product_be
signed_result
        ldd     product_be
        tst     math_negative
        beq     math_done
        ldd     #0
        subd    product_be
math_done
        rts

; Match a word without consuming source on mismatch. Carry=success.
keyword pshs    x
keyword_next
        lda     ,u+
        beq     keyword_yes
        cmpa    ,x+
        bne     keyword_no
        bra     keyword_next
keyword_yes
        leas    2,s
        orcc    #1
        rts
keyword_no
        puls    x
        andcc   #$fe
        rts
word_or fcc 'OR'
        fcb 0
word_and fcc 'AND'
        fcb 0
word_mod fcc 'MOD'
        fcb 0
word_not fcc 'NOT'
        fcb 0
word_abs fcc 'ABS'
        fcb 0
word_sgn fcc 'SGN'
        fcb 0
word_clr fcc 'CLR'
        fcb 0
word_let fcc 'LET'
        fcb 0
